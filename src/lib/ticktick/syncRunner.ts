// No network/DB work at module load. The first live run requires explicit enablement.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { TickTickAuthError, TickTickNotFoundError, completeTask, createTask, deleteTask, getTask, listOpenTasks, listSyncedProjects, moveTask, updateTask } from "./client";
import { localToTickTickPayload, remoteToLocalFields, toRemoteTask } from "./mapping";
import { planSync, type LocalTask, type SyncAction } from "./syncPlan";
import { SYNCED_LISTS, type ListName, type RemoteTask, type TickTickApiTask } from "./types";

const STATE_ID = "main";
const OWNER_EMAIL = "fgt.consultorias@gmail.com";
const enabled = () => process.env.TICKTICK_SYNC_ENABLED === "true";
const configured = () => Boolean(process.env.TICKTICK_ACCESS_TOKEN?.trim());
const configurationMessage = () => !configured() ? "Configure a conexão com o TickTick para gerar uma prévia." : !enabled() ? "Sincronização aguardando ativação. Primeiro confira a prévia das tarefas." : null;
export type SyncSummary = {
  ok: boolean; skipped?: "running" | "disabled"; enabled?: boolean; configured?: boolean;
  message?: string | null; authBroken?: boolean; error?: string; warnings?: string[];
  counts: Record<SyncAction["kind"], number>; actions?: { kind: string; title: string }[];
};
const emptyCounts = (): SyncSummary["counts"] => ({pullCreate:0,pullUpdate:0,link:0,pushCreate:0,pushUpdate:0,pushComplete:0,pushDelete:0,checkMissing:0});

/** No automatic stale takeover: a suspended worker may still issue a remote write.
 * A hard-killed worker's lock needs operator recovery after confirming it has stopped.
 * Token predicates also prevent a former holder from releasing a replacement lock.
 */
async function claimLock(token: string, started: Date) {
  await prisma.tickTickSyncState.upsert({where:{id:STATE_ID},create:{id:STATE_ID},update:{}});
  const result = await prisma.tickTickSyncState.updateMany({where:{id:STATE_ID,runningSince:null,lockToken:null},data:{runningSince:started,lockToken:token,lastRunAt:started}});
  return result.count === 1;
}
function remoteMetadata(r: RemoteTask) {
  return {tickTickId:r.id,tickTickProjectId:r.projectId,tickTickEtag:r.etag,tickTickModified:r.modifiedTime ? new Date(r.modifiedTime):null};
}
function remoteFields(r: RemoteTask, stamp = new Date()) {
  return {...remoteMetadata(r),syncedAt:stamp,updatedAt:stamp};
}
type TaskRow = Awaited<ReturnType<typeof prisma.todoTask.findMany>>[number];
function localTask(t: TaskRow): LocalTask {
  return {...t,dueDate:t.dueDate?.toISOString()??null,tickTickModified:t.tickTickModified?.toISOString()??null,syncedAt:t.syncedAt?.toISOString()??null,updatedAt:t.updatedAt.toISOString()};
}
const versionWhere = (t: TaskRow, userId: string) => ({id:t.id,userId,updatedAt:t.updatedAt,tickTickId:t.tickTickId,tickTickProjectId:t.tickTickProjectId,status:t.status});
async function conditionalWrite(t:TaskRow,userId:string,data:Parameters<typeof prisma.todoTask.updateMany>[0]["data"]) {
  const result=await prisma.todoTask.updateMany({where:versionWhere(t,userId),data});
  if(result.count!==1) throw new Error("Tarefa alterada durante a sincronização. Tente novamente.");
}
/** Record our successful remote write even if the submitted local revision lost
 * its CAS. Never stamp syncedAt or let Prisma advance updatedAt for metadata alone.
 * Completion consumes only the original intent; concurrent content stays dirty.
 */
async function acknowledgePush(t:TaskRow,userId:string,remote:RemoteTask,
  data:Parameters<typeof prisma.todoTask.updateMany>[0]["data"],completionStatus?:number) {
  const acknowledged=await prisma.todoTask.updateMany({where:versionWhere(t,userId),data});
  if(acknowledged.count===1) return;
  for(let attempt=0;attempt<3;attempt++) {
    const current=await prisma.todoTask.findFirst({where:{id:t.id,userId,tickTickId:t.tickTickId,tickTickProjectId:t.tickTickProjectId}});
    if(!current) throw new Error("Resposta remota requer reconciliação: vínculo local mudou");
    const completion: Parameters<typeof prisma.todoTask.updateMany>[0]["data"] = {};
    if(completionStatus!==undefined && current.status==="done" && t.status==="done"
      && current.completedAt?.getTime()===t.completedAt?.getTime()) {
      completion.status=completionStatus===2?"done":"pending";
      completion.completedAt=completionStatus===2?(current.completedAt??new Date()):null;
      // Advance the occurrence without replacing a concurrent local reschedule.
      if(current.dueDate?.getTime()===t.dueDate?.getTime() && current.allDay===t.allDay) {
        const fields=remoteToLocalFields(remote);
        completion.dueDate=fields.dueDate;
        completion.allDay=fields.allDay;
      }
    }
    const saved=await prisma.todoTask.updateMany({where:versionWhere(current,userId),data:{...remoteMetadata(remote),...completion,updatedAt:current.updatedAt}});
    if(saved.count===1) throw new Error("Tarefa editada durante envio; resposta remota registrada e edição local preservada para próxima sincronização");
  }
  throw new Error("Tarefa continua sendo editada; resposta remota requer reconciliação");
}
async function deleteIgnoringMissing(projectId:string,id:string) {
  try { await deleteTask(projectId,id); } catch(e) { if(!(e instanceof TickTickNotFoundError)) throw e; }
}
function sameOccurrence(t:TaskRow,r:RemoteTask) {
  const fields=remoteToLocalFields(r);
  return (t.dueDate?.getTime()??null)===(fields.dueDate?.getTime()??null);
}
async function applyAction(a:SyncAction,userId:string,projects:Record<ListName,string>,rows:TaskRow[], remotes:RemoteTask[]) {
  if(a.kind==="pullCreate") {
    await prisma.todoTask.create({data:{...remoteToLocalFields(a.remote),...remoteFields(a.remote),status:"pending",source:"ticktick",type:a.remote.listName==="Financeiro"?"financial":"general",userId}});
    return;
  }
  const id="localId" in a?a.localId:a.local.id;
  let t=rows.find(t=>t.id===id);
  if(!t) throw new Error("Tarefa fora do escopo da sincronização");
  // Check again before remote side effects; all subsequent writes use the original version.
  const current=await prisma.todoTask.findFirst({where:versionWhere(t,userId)});
  if(!current) throw new Error("Tarefa alterada durante a sincronização");
  if(a.kind==="pullUpdate"||a.kind==="link") {
    await conditionalWrite(t,userId,{...remoteToLocalFields(a.remote),...remoteFields(a.remote),...(t.status==="done"?{status:"pending",completedAt:null}:{})});
    return;
  }
  if(a.kind==="pushCreate") {
    const saved=await createTask(localToTickTickPayload(t,projects[a.listName]));
    const remote=toRemoteTask(saved,a.listName);
    const stamp = new Date();
    await acknowledgePush(t,userId,remote,{listName:a.listName,...remoteFields(remote,stamp)});
    return;
  }
  if(!t.tickTickId||!t.tickTickProjectId) throw new Error("Vínculo TickTick incompleto");
  if(a.kind==="pushDelete") {
    await deleteIgnoringMissing(t.tickTickProjectId,t.tickTickId);
    const stamp=new Date();
    await conditionalWrite(t,userId,{tickTickId:null,tickTickProjectId:null,tickTickEtag:null,tickTickModified:null,syncedAt:stamp,updatedAt:stamp});
    return;
  }
  // Always inspect completion state before side effects. Retaining the remote id is
  // essential: retries must recognize a completed task or a next recurring occurrence.
  let raw: TickTickApiTask;
  try { raw=await getTask(t.tickTickProjectId,t.tickTickId); }
  catch(e) {
    // A previous move may have succeeded while its response/local write failed.
    const relocated=remotes.find(r=>r.id===t!.tickTickId && r.projectId!==t!.tickTickProjectId);
    if(e instanceof TickTickNotFoundError && relocated) {
      raw=await getTask(relocated.projectId,relocated.id);
    } else {
    if(!(e instanceof TickTickNotFoundError)||a.kind!=="checkMissing") throw e;
    const stamp=new Date();
    await conditionalWrite(t,userId,{status:"cancelled",tickTickId:null,tickTickProjectId:null,syncedAt:stamp,updatedAt:stamp,description:`${t.description??""}\n[Saiu das listas sincronizadas do TickTick]`.trim()});
    return;
    }
  }
  if(raw.id!==t.tickTickId || (raw.status!==0 && raw.status!==2)) throw new Error("Resposta inválida ao consultar tarefa no TickTick");
  const list=(Object.keys(projects) as ListName[]).find(n=>projects[n]===raw.projectId);
  if(!list) throw new Error("Tarefa remota fora das listas sincronizadas; reconciliação necessária");
  let remote=toRemoteTask(raw,list);
  if(a.kind==="checkMissing") {
    await conditionalWrite(t,userId,{...remoteToLocalFields(remote),...remoteFields(remote),status:raw.status===2?"done":"pending",completedAt:raw.status===2?new Date():null});
    return;
  }
  if(a.kind==="pushComplete") {
    if(raw.status!==2 && remote.isRecurring && !sameOccurrence(t,remote)) {
      await conditionalWrite(t,userId,{...remoteToLocalFields(remote),...remoteFields(remote),status:"pending",completedAt:null});
      return;
    }
    if(raw.status!==2) {
      // When the next occurrence has exactly the same date, no API evidence can
      // distinguish it from a retry. Restore a reviewable pending task without completing.
      if(remote.isRecurring && (!t.tickTickEtag || !remote.etag || remote.etag!==t.tickTickEtag)) {
        await conditionalWrite(t,userId,{...remoteToLocalFields(remote),...remoteFields(remote),status:"pending",completedAt:null});
        return `Conflito de recorrência: "${remote.title}" voltou a pendente com os dados do TickTick. Revise a ocorrência antes de concluir novamente.`;
      }
      await completeTask(t.tickTickProjectId,t.tickTickId);
      raw=await getTask(t.tickTickProjectId,t.tickTickId);
      if(raw.id!==t.tickTickId || raw.projectId!==t.tickTickProjectId || (raw.status!==0 && raw.status!==2)) throw new Error("Resposta inválida após conclusão no TickTick");
      remote=toRemoteTask(raw,list);
    }
    await acknowledgePush(t,userId,remote,{...remoteToLocalFields(remote),...remoteFields(remote),status:raw.status===2?"done":"pending",completedAt:raw.status===2?(t.completedAt??new Date()):null},raw.status);
    return;
  }
  if(a.kind==="pushUpdate") {
    if(raw.status===2) throw new Error("Reabrir tarefa concluída exige ação no TickTick; nenhuma tarefa foi recriada.");
    const destination=projects[a.listName];
    if(raw.projectId!==destination) {
      await moveTask(t.tickTickId,raw.projectId,destination);
    }
    if(t.tickTickProjectId!==destination) {
      // Acknowledge only the move, not title/date edits still awaiting updateTask.
      const moved=await prisma.todoTask.updateMany({where:versionWhere(t,userId),data:{tickTickProjectId:destination,updatedAt:t.updatedAt}});
      if(moved.count!==1) {
        await prisma.todoTask.updateMany({where:{id:t.id,userId,tickTickId:t.tickTickId,tickTickProjectId:t.tickTickProjectId},data:{tickTickProjectId:destination}});
        throw new Error("Tarefa editada durante movimento; vínculo atualizado para próxima sincronização");
      }
      t={...t,tickTickProjectId:destination};
      raw=await getTask(destination,t.tickTickId!);
      if(raw.id!==t.tickTickId||raw.projectId!==destination||raw.status!==0) throw new Error("Não foi possível confirmar tarefa movida");
    }
    const payload=localToTickTickPayload(t,destination,raw);
    if(raw.repeatFlag) payload.repeatFlag=raw.repeatFlag;
    const saved=await updateTask(t.tickTickId,payload);
    const committed=toRemoteTask(saved,a.listName);
    await acknowledgePush(t,userId,committed,remoteFields(committed));
  }
}
const actionTitle=(a:SyncAction)=>"remote" in a?a.remote.title:a.local.title;
export async function runTickTickSync(opts:{dryRun?:boolean}={}):Promise<SyncSummary> {
  const counts=emptyCounts();
  const warnings:string[]=[];
  const config={enabled:enabled(),configured:configured(),message:configurationMessage()};
  if(!opts.dryRun&&!enabled()) return {ok:true,skipped:"disabled",counts,...config};
  const token=randomUUID(), started=new Date();
  let claimed=false;
  try {
    claimed=await claimLock(token,started);
    if(!claimed) return {ok:true,skipped:"running",counts,...config};
    const user=await prisma.user.findUnique({where:{email:OWNER_EMAIL}});
    if(!user) throw new Error("Responsável da integração não configurado");
    const projects=await listSyncedProjects();
    const ids=new Set<string>();
    for(const name of SYNCED_LISTS) {
      const matches=projects.filter(p=>p.listName===name);
      if(matches.length!==1 || !matches[0].id || ids.has(matches[0].id)) throw new Error(`Lista obrigatória ausente ou duplicada: ${name}`);
      ids.add(matches[0].id);
    }
    if(projects.length!==SYNCED_LISTS.length) throw new Error("Listas inesperadas na origem TickTick");
    const projectMap=Object.fromEntries(projects.map(p=>[p.listName,p.id])) as Record<ListName,string>;
    const batches=await Promise.all(projects.map(async p=> {
      const tasks=await listOpenTasks(p.id,p.listName);
      if(!Array.isArray(tasks)||tasks.some(t=>!t.id||t.projectId!==p.id||t.listName!==p.listName)) throw new Error("Resposta incompleta de tarefas do TickTick");
      return tasks;
    }));
    const remotes=batches.flat();
    if(new Set(remotes.map(r=>r.id)).size!==remotes.length) throw new Error("Tarefas duplicadas na origem TickTick");
    const rows=await prisma.todoTask.findMany({where:{userId:user.id,OR:[{tickTickId:{not:null}},{status:{in:["pending","waiting"]}}]}});
    const actions=planSync(rows.map(localTask),remotes,projectMap);
    for(const a of actions) counts[a.kind]++;
    if(opts.dryRun) return {ok:true,counts,actions:actions.map(a=>({kind:a.kind,title:actionTitle(a)})),...config};
    for(const a of actions) {
      const lock=await prisma.tickTickSyncState.findUnique({where:{id:STATE_ID}});
      if(lock?.lockToken!==token) throw new Error("Posse da trava perdida");
      const warning=await applyAction(a,user.id,projectMap,rows,remotes);
      if(warning) warnings.push(warning);
    }
    await prisma.tickTickSyncState.updateMany({where:{id:STATE_ID,lockToken:token},data:{lastOkAt:new Date(),lastError:warnings.join("\n")||null,authBroken:false}});
    return {ok:true,counts,...config,...(warnings.length?{warnings}:{})};
  } catch(e) {
    const authBroken=e instanceof TickTickAuthError;
    const error=authBroken?"Conexão com o TickTick indisponível. Reconecte sua conta.":e instanceof Error?e.message:String(e);
    if(claimed) await prisma.tickTickSyncState.updateMany({where:{id:STATE_ID,lockToken:token},data:{lastError:error,authBroken}});
    return {ok:false,error,authBroken,counts,...config};
  } finally {
    if(claimed) await prisma.tickTickSyncState.updateMany({where:{id:STATE_ID,lockToken:token,runningSince:started},data:{runningSince:null,lockToken:null}});
  }
}
export async function getSyncStatus() {
  const s=await prisma.tickTickSyncState.findUnique({where:{id:STATE_ID}});
  return {runningSince:s?.runningSince?.toISOString()??null,lastOkAt:s?.lastOkAt?.toISOString()??null,lastRunAt:s?.lastRunAt?.toISOString()??null,lastError:s?.lastError??null,authBroken:s?.authBroken??false,enabled:enabled(),configured:configured(),message:configurationMessage()};
}
/** Must succeed before local deletion. An unconfigured/disabled linked integration
 * cannot authorize deleting only the local half. Ownership is always explicit. */
export async function deleteRemoteFor(taskId:string,userId:string,afterRemoteDelete?: (task:TaskRow)=>Promise<void>) {
  const token=randomUUID(),started=new Date();
  if(!(await claimLock(token,started))) throw new Error("Sincronização em andamento. Tente excluir novamente em instantes.");
  try {
    const t=await prisma.todoTask.findFirst({where:{id:taskId,userId}});
    if(!t) throw new Error("Tarefa não encontrada");
    if(t.tickTickId) {
      if(!enabled()) throw new Error(configurationMessage()??"Sincronização desativada");
      if(!t.tickTickProjectId) throw new Error("Vínculo TickTick incompleto");
      await deleteIgnoringMissing(t.tickTickProjectId,t.tickTickId);
    }
    if(afterRemoteDelete) await afterRemoteDelete(t);
  } finally {
    await prisma.tickTickSyncState.updateMany({where:{id:STATE_ID,lockToken:token,runningSince:started},data:{runningSince:null,lockToken:null}});
  }
}

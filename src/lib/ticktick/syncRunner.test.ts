import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user:vi.fn(), move:vi.fn(), complete:vi.fn(), create:vi.fn(), update:vi.fn(), lockToken:null as string|null, state: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() }, task: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() }, projects: vi.fn(), open: vi.fn(), get: vi.fn(), del: vi.fn(), plan: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { tickTickSyncState: m.state, todoTask: m.task, user: { findUnique: m.user } } }));
vi.mock("./client", () => ({ TickTickAuthError: class extends Error {}, TickTickNotFoundError: class extends Error {}, moveTask:m.move, listSyncedProjects: m.projects, listOpenTasks: m.open, getTask:m.get, deleteTask:m.del, createTask:m.create, updateTask:m.update, completeTask:m.complete }));
vi.mock("./syncPlan", () => ({ planSync: m.plan }));
vi.mock("./mapping", () => ({ toRemoteTask:(t:Record<string,unknown>,listName:string)=>({...t,listName,isRecurring:Boolean(t.repeatFlag),etag:t.etag??null,modifiedTime:t.modifiedTime??null}), remoteToLocalFields:(t:Record<string,unknown>)=>({title:t.title,description:null,dueDate:t.dueDate?new Date(String(t.dueDate)):null,allDay:true,priority:"media",listName:t.listName,isRecurring:Boolean(t.isRecurring)}), localToTickTickPayload:(t:unknown)=>t }));
vi.mock("./types", () => ({ SYNCED_LISTS: ["Work","Financeiro","Estudos"] }));
import { runTickTickSync, deleteRemoteFor } from "./syncRunner";
describe("executor safety", () => {
 beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("TICKTICK_SYNC_ENABLED","true"); vi.stubEnv("TICKTICK_ACCESS_TOKEN","mock"); m.user.mockResolvedValue({id:"owner"}); m.state.updateMany.mockImplementation(async (arg) => { if (arg.data.lockToken) m.lockToken=arg.data.lockToken; return {count:1}; }); m.state.findUnique.mockImplementation(async()=>({lockToken:m.lockToken})); m.task.updateMany.mockResolvedValue({count:1}); m.projects.mockResolvedValue([ {id:"w",listName:"Work"}, {id:"f",listName:"Financeiro"}, {id:"e",listName:"Estudos"} ]); m.open.mockResolvedValue([]); m.task.findMany.mockResolvedValue([]); m.plan.mockReturnValue([]); });
 it("does not acquire a lock or call API while disabled", async () => { vi.stubEnv("TICKTICK_SYNC_ENABLED","false"); expect(await runTickTickSync()).toMatchObject({skipped:"disabled"}); expect(m.state.upsert).not.toHaveBeenCalled(); expect(m.projects).not.toHaveBeenCalled(); });
 it("does not release another runner's lock", async () => { m.state.updateMany.mockResolvedValue({count:0}); expect(await runTickTickSync()).toMatchObject({skipped:"running"}); expect(m.state.updateMany).toHaveBeenCalledTimes(1); });
 it("rejects missing required lists before fetching or writing tasks", async () => { m.projects.mockResolvedValue([{id:"w",listName:"Work"}]); expect((await runTickTickSync()).ok).toBe(false); expect(m.task.findMany).not.toHaveBeenCalled(); expect(m.task.updateMany).not.toHaveBeenCalled(); });
 it("rejects duplicate required lists", async () => { m.projects.mockResolvedValue([{id:"w",listName:"Work"},{id:"w2",listName:"Work"},{id:"f",listName:"Financeiro"},{id:"e",listName:"Estudos"}]); expect((await runTickTickSync()).ok).toBe(false); expect(m.open).not.toHaveBeenCalled(); });
 it("aborts all task writes on partial network failure", async () => { m.open.mockRejectedValueOnce(new Error("network")); expect((await runTickTickSync()).ok).toBe(false); expect(m.plan).not.toHaveBeenCalled(); expect(m.task.updateMany).not.toHaveBeenCalled(); });
 it("dry run plans but never writes tasks", async () => { expect((await runTickTickSync({dryRun:true})).ok).toBe(true); expect(m.task.updateMany).not.toHaveBeenCalled(); expect(m.task.create).not.toHaveBeenCalled(); });
 it("repeated empty sync is idempotent and releases with ownership predicate", async () => { await runTickTickSync(); await runTickTickSync(); expect(m.task.create).not.toHaveBeenCalled(); expect(m.state.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({id:"main",runningSince:expect.any(Date),lockToken:expect.any(String)}),data:{runningSince:null,lockToken:null}})); });
 it("propagates remote deletion failure and scopes lookup to owner", async () => { m.task.findFirst.mockResolvedValue({id:"t",updatedAt:new Date(),tickTickId:"r",tickTickProjectId:"w"}); m.del.mockRejectedValue(new Error("delete failed")); await expect(deleteRemoteFor("t","owner")).rejects.toThrow("delete failed"); expect(m.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:"t",userId:"owner"}})); });
 const row=()=>({id:"t",userId:"owner",title:"Task",description:null,dueDate:new Date("2026-10-17T00:00:00Z"),allDay:true,status:"done",priority:"media",type:"general",listName:"Work",tickTickId:"r",tickTickProjectId:"w",tickTickEtag:"v1",tickTickModified:new Date("2026-10-16T00:00:00Z"),syncedAt:new Date("2026-10-16T00:00:00Z"),updatedAt:new Date("2026-10-17T00:00:00Z"),completedAt:new Date("2026-10-17T00:00:00Z"),isRecurring:true});
 it("never completes a next recurring occurrence on retry",async()=>{
  const t=row(); m.task.findMany.mockResolvedValue([t]);m.task.findFirst.mockResolvedValue(t);m.plan.mockReturnValue([{kind:"pushComplete",local:t}]);
  m.get.mockResolvedValue({id:"r",projectId:"w",title:"Task",dueDate:"2026-10-18T00:00:00Z",repeatFlag:"RRULE:FREQ=DAILY",status:0,etag:"v2"});
  expect((await runTickTickSync()).ok).toBe(true);expect(m.complete).not.toHaveBeenCalled();
  expect(m.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({userId:"owner",updatedAt:t.updatedAt}),data:expect.objectContaining({status:"pending"})}));
 });
 it("does not re-complete remote already completed",async()=>{
  const t={...row(),isRecurring:false};m.task.findMany.mockResolvedValue([t]);m.task.findFirst.mockResolvedValue(t);m.plan.mockReturnValue([{kind:"pushComplete",local:t}]);m.get.mockResolvedValue({id:"r",projectId:"w",title:"Task",status:2});
  await runTickTickSync();await runTickTickSync();expect(m.complete).not.toHaveBeenCalled();
 });
 it("moves recurring tasks using official API without recreation",async()=>{
  const t=row();m.task.findMany.mockResolvedValue([t]);m.task.findFirst.mockResolvedValue(t);m.plan.mockReturnValue([{kind:"pushUpdate",local:t,listName:"Estudos",moveFromProjectId:"w"}]);
  m.get.mockResolvedValueOnce({id:"r",projectId:"w",title:"Task",repeatFlag:"RRULE:FREQ=DAILY",status:0}).mockResolvedValueOnce({id:"r",projectId:"e",title:"Task",repeatFlag:"RRULE:FREQ=DAILY",status:0});m.update.mockResolvedValue({id:"r",projectId:"e",title:"Task",repeatFlag:"RRULE:FREQ=DAILY",status:0});
  expect((await runTickTickSync()).ok).toBe(true);expect(m.move).toHaveBeenCalledWith("r","w","e");expect(m.create).not.toHaveBeenCalled();expect(m.del).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith("r",expect.objectContaining({repeatFlag:"RRULE:FREQ=DAILY"}));
 });
 it("does not acknowledge remaining edits when refetch after move fails",async()=>{
  const t=row();m.task.findMany.mockResolvedValue([t]);m.task.findFirst.mockResolvedValue(t);m.plan.mockReturnValue([{kind:"pushUpdate",local:t,listName:"Estudos",moveFromProjectId:"w"}]);m.get.mockResolvedValueOnce({id:"r",projectId:"w",title:"Task",status:0}).mockRejectedValueOnce(new Error("fetch failed"));
  expect((await runTickTickSync()).ok).toBe(false);expect(m.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{tickTickProjectId:"e",updatedAt:t.updatedAt}}));expect(m.update).not.toHaveBeenCalled();
 });
 it("does not overwrite local edits after fetch",async()=>{
  const t=row();m.task.findMany.mockResolvedValue([t]);m.task.findFirst.mockResolvedValue(null);m.plan.mockReturnValue([{kind:"pullUpdate",localId:"t",remote:{id:"r",title:"Old remote"}}]);
  expect((await runTickTickSync()).ok).toBe(false);expect(m.task.updateMany).not.toHaveBeenCalled();
 });
 it("aborts if any fetched task points outside its requested project",async()=>{
  m.open.mockResolvedValueOnce([{id:"x",projectId:"wrong",listName:"Work"}]);expect((await runTickTickSync()).ok).toBe(false);expect(m.plan).not.toHaveBeenCalled();
 });

});

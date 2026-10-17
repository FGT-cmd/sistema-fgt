import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { deleteRemoteFor, runTickTickSync } from "@/lib/ticktick/syncRunner";
import { parseTaskInput, TaskInputError } from "@/lib/ticktick/taskInput";
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getDefaultUser();
    const body = parseTaskInput(await req.json());
    if (body.clientId && !(await prisma.client.findFirst({where:{id:body.clientId,userId:user.id},select:{id:true}}))) return NextResponse.json({error:"Aluno não encontrado"},{status:400});
    const task = await prisma.todoTask.update({where:{id,userId:user.id},data:body,include:{subtasks:{orderBy:{position:"asc"}},client:{select:{id:true,name:true}}}});
    after(async () => { try { await runTickTickSync(); } catch(err) { console.error("[tarefas/sync]",err); } });
    return NextResponse.json(task);
  } catch(err) {
    if(err instanceof TaskInputError || err instanceof SyntaxError) return NextResponse.json({error:err.message},{status:400});
    if(err && typeof err==="object" && "code" in err && err.code==="P2025") return NextResponse.json({error:"Tarefa não encontrada"},{status:404});
    console.error("[PATCH /api/tarefas/[id]]",err);
    return NextResponse.json({error:"Falha ao atualizar tarefa"},{status:500});
  }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getDefaultUser();
    const task = await prisma.todoTask.findFirst({where:{id,userId:user.id}});
    if(!task) return NextResponse.json({error:"Tarefa não encontrada"},{status:404});
    // Propagate all non-404 remote failures: never delete only the local half.
    let changed=false;
    await deleteRemoteFor(id,user.id,async snapshot => {
      const result=await prisma.todoTask.deleteMany({where:{id,userId:user.id,updatedAt:snapshot.updatedAt,tickTickId:snapshot.tickTickId,tickTickProjectId:snapshot.tickTickProjectId}});
      changed=result.count!==1;
    });
    if(changed) return NextResponse.json({error:"Tarefa alterada durante a exclusão; revise antes de tentar novamente"},{status:409});
    return NextResponse.json({ok:true});
  } catch(err) {
    console.error("[DELETE /api/tarefas/[id]]",err);
    return NextResponse.json({error:err instanceof Error?err.message:"Falha ao excluir tarefa"},{status:502});
  }
}

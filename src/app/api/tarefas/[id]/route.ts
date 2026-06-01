import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // completedAt: set when status → done, clear when status → anything else
    const completedAtUpdate: { completedAt?: Date | null } = {};
    if (body.status === "done") {
      completedAtUpdate.completedAt = new Date();
    } else if (body.status !== undefined) {
      completedAtUpdate.completedAt = null;
    }

    const task = await prisma.todoTask.update({
      where: { id },
      data: {
        ...(body.title       !== undefined && { title:       body.title }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.dueDate     !== undefined && { dueDate:     body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.status      !== undefined && { status:      body.status }),
        ...(body.priority    !== undefined && { priority:    body.priority }),
        ...(body.type        !== undefined && { type:        body.type }),
        ...(body.urgent      !== undefined && { urgent:      body.urgent }),
        ...(body.important   !== undefined && { important:   body.important }),
        ...(body.clientId    !== undefined && { clientId:    body.clientId || null }),
        ...completedAtUpdate,
      },
      include: {
        subtasks: { orderBy: { position: "asc" } },
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(task);
  } catch (err) {
    console.error("[PATCH /api/tarefas/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.todoTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const { taskId } = await params;
    const body = await req.json();
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        title:    body.title,
        priority: body.priority,
        status:   body.status,
        dueDate:  body.dueDate ? new Date(body.dueDate) : null,
      },
    });
    return NextResponse.json(task);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const { taskId } = await params;
    await prisma.task.delete({ where: { id: taskId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

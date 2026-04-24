import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ subId: string }> }) {
  const { subId } = await params;
  const body = await req.json();

  const subtask = await prisma.subtask.update({
    where: { id: subId },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.completed !== undefined && { completed: body.completed }),
    },
  });

  return NextResponse.json(subtask);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ subId: string }> }) {
  const { subId } = await params;
  await prisma.subtask.delete({ where: { id: subId } });
  return NextResponse.json({ ok: true });
}

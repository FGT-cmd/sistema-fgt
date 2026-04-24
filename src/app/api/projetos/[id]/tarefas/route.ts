import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const user = await getDefaultUser();
    const body = await req.json();
    const task = await prisma.task.create({
      data: {
        title:       body.title,
        priority:    body.priority ?? "medium",
        status:      body.status   ?? "todo",
        dueDate:     body.dueDate  ? new Date(body.dueDate) : null,
        projectId,
        userId:      user.id,
      },
    });
    return NextResponse.json(task);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

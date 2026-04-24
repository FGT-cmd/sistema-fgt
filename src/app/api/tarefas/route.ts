import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { userId: user.id };
    if (status && status !== "all") {
      where.status = status;
    }

    const tasks = await prisma.todoTask.findMany({
      where,
      include: {
        subtasks: { orderBy: { position: "asc" } },
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(tasks);
  } catch (err) {
    console.error("[GET /api/tarefas]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();

    const task = await prisma.todoTask.create({
      data: {
        title: body.title,
        description: body.description || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        type: body.type || "general",
        source: body.source || "manual",
        urgent: body.urgent ?? null,
        important: body.important ?? null,
        clientId: body.clientId || null,
        userId: user.id,
      },
      include: {
        subtasks: true,
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(task);
  } catch (err) {
    console.error("[POST /api/tarefas]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

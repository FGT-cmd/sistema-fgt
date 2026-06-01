import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const { searchParams } = new URL(req.url);

    const period   = searchParams.get("period");
    const type     = searchParams.get("type");
    const priority = searchParams.get("priority");
    const status   = searchParams.get("status");
    const clientId = searchParams.get("clientId");

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekEnd   = new Date(todayEnd); weekEnd.setDate(weekEnd.getDate() + 7);

    const where: Record<string, unknown> = { userId: user.id };

    if (period) {
      switch (period) {
        case "today":
          where.status = { notIn: ["done", "cancelled"] };
          where.dueDate = { gte: todayStart, lte: todayEnd };
          break;
        case "overdue":
          where.status = { notIn: ["done", "cancelled"] };
          where.dueDate = { lt: todayStart };
          break;
        case "week":
          where.status = { notIn: ["done", "cancelled"] };
          where.dueDate = { gte: tomorrowStart, lte: weekEnd };
          break;
        case "waiting":
          where.status = "waiting";
          break;
        case "backlog":
          where.status = { notIn: ["done", "cancelled", "waiting"] };
          where.OR = [{ dueDate: null }, { dueDate: { gt: weekEnd } }];
          break;
        case "done":
          where.status = "done";
          break;
      }
    } else if (status && status !== "all") {
      where.status = status;
    }

    if (type)     where.type     = type;
    if (priority) where.priority = priority;
    if (clientId) where.clientId = clientId;

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
        title:       body.title,
        description: body.description || null,
        dueDate:     body.dueDate ? new Date(body.dueDate) : null,
        type:        body.type     || "general",
        priority:    body.priority || "media",
        source:      body.source   || "manual",
        urgent:      body.urgent   ?? null,
        important:   body.important ?? null,
        clientId:    body.clientId || null,
        userId:      user.id,
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

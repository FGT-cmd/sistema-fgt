import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  const user = await getDefaultUser();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [todayTasks, overdueTasks, activeStudents, pendingFinancial] = await Promise.all([
    prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: "pending",
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.todoTask.count({
      where: {
        userId: user.id,
        status: "pending",
        dueDate: { lt: todayStart },
      },
    }),
    prisma.client.count({
      where: { userId: user.id, status: "ativo" },
    }),
    prisma.financialTx.count({
      where: {
        status: { in: ["pendente", "atrasado"] },
        dueDate: { lte: new Date() },
      },
    }),
  ]);

  return NextResponse.json({
    todayTasks,
    overdueTasks,
    activeStudents,
    pendingFinancial,
  });
}

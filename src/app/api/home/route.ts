import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  const user = await getDefaultUser();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const nextWeek = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    todayTasks,
    overdueTasksList,
    overdueTasksCount,
    activeStudents,
    overduePayments,
    todayPayments,
    upcomingEvents,
    priorityTasks,
  ] = await Promise.all([
    // Tarefas de hoje (pending + in_progress)
    prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: { not: "done" },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ urgent: "desc" }, { important: "desc" }, { createdAt: "asc" }],
    }),

    // Lista tarefas atrasadas (top 6 para exibição)
    prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: { not: "done" },
        dueDate: { lt: todayStart },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),

    // Count total de tarefas atrasadas
    prisma.todoTask.count({
      where: {
        userId: user.id,
        status: { not: "done" },
        dueDate: { lt: todayStart },
      },
    }),

    // Alunos ativos
    prisma.client.count({
      where: { userId: user.id, status: "ativo" },
    }),

    // Parcelas vencidas (não pagas, dueDate < hoje)
    prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { lt: todayStart },
        sale: { client: { userId: user.id } },
      },
      include: {
        sale: {
          select: {
            id: true,
            description: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),

    // Parcelas vencendo hoje
    prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { gte: todayStart, lte: todayEnd },
        sale: { client: { userId: user.id } },
      },
      include: {
        sale: {
          select: {
            id: true,
            description: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { amount: "desc" },
    }),

    // Próximos eventos (próximos 7 dias, a partir de agora)
    prisma.calendarEvent.findMany({
      where: {
        userId: user.id,
        start: { gte: now, lte: nextWeek },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { start: "asc" },
      take: 5,
    }),

    // Tarefas prioritárias (urgent ou important, sem data ou data futura)
    prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: { not: "done" },
        AND: [
          { OR: [{ urgent: true }, { important: true }] },
          { OR: [{ dueDate: null }, { dueDate: { gt: todayEnd } }] },
        ],
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ urgent: "desc" }, { important: "desc" }, { dueDate: "asc" }],
      take: 6,
    }),
  ]);

  return NextResponse.json({
    todayTasks,
    overdueTasksList,
    overdueTasks: overdueTasksCount,
    activeStudents,
    pendingFinancial: overduePayments.length + todayPayments.length,
    overduePayments,
    todayPayments,
    upcomingEvents,
    priorityTasks,
  });
}

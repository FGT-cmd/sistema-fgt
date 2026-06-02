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
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    todayTasks,
    overdueTasksList,
    overdueTasksCount,
    activeStudents,
    overduePayments,
    todayPayments,
    weekPayments,
    upcomingEvents,
    priorityTasks,
    recebidoMes,
    aReceberTotal,
  ] = await Promise.all([
    // Tarefas de hoje
    prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: { notIn: ["done", "cancelled"] },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ urgent: "desc" }, { important: "desc" }, { createdAt: "asc" }],
    }),

    // Lista tarefas atrasadas (top 6)
    prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: { notIn: ["done", "cancelled"] },
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
        status: { notIn: ["done", "cancelled"] },
        dueDate: { lt: todayStart },
      },
    }),

    // Alunos ativos
    prisma.client.count({ where: { userId: user.id, status: "ativo" } }),

    // Parcelas vencidas (não pagas, dueDate < hoje) — sem take para cálculo correto do total
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

    // Parcelas vencendo nos próximos 7 dias (excluindo hoje)
    prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { gt: todayEnd, lte: nextWeek },
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
      take: 8,
    }),

    // Próximos eventos (próximos 7 dias)
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
        status: { notIn: ["done", "cancelled"] },
        AND: [
          { OR: [{ urgent: true }, { important: true }] },
          { OR: [{ dueDate: null }, { dueDate: { gt: todayEnd } }] },
        ],
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ urgent: "desc" }, { important: "desc" }, { dueDate: "asc" }],
      take: 6,
    }),

    // Recebido este mês (parcelas pagas)
    prisma.installment.findMany({
      where: {
        status: "pago",
        paidAt: { gte: monthStart, lte: todayEnd },
        sale: { client: { userId: user.id } },
      },
      select: { netValue: true, amount: true },
    }),

    // A receber (parcelas não pagas com vencimento futuro)
    prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { gt: todayEnd },
        sale: { client: { userId: user.id } },
      },
      select: { netValue: true, amount: true },
    }),
  ]);

  // Atrasado: soma das parcelas vencidas (preferindo netValue para não inflar com taxas do gateway)
  const atrasadoTotal = overduePayments.reduce((s, p) => s + (p.netValue ?? p.amount), 0);

  // Alunos em atenção: derivados de overduePayments agrupados por cliente
  const clientsMap = new Map<string, { id: string; name: string; overdueCount: number; overdueTotal: number }>();
  for (const p of overduePayments) {
    const { id, name } = p.sale.client;
    const ex = clientsMap.get(id) ?? { id, name, overdueCount: 0, overdueTotal: 0 };
    ex.overdueCount++;
    ex.overdueTotal += p.netValue ?? p.amount;
    clientsMap.set(id, ex);
  }
  const studentsAttention = Array.from(clientsMap.values()).slice(0, 5);

  return NextResponse.json({
    todayTasks,
    overdueTasksList,
    overdueTasks: overdueTasksCount,
    activeStudents,
    pendingFinancial: overduePayments.length + todayPayments.length,
    overduePayments,
    todayPayments,
    weekPayments,
    upcomingEvents,
    priorityTasks,
    studentsAttention,
    financialSummary: {
      recebidoMes: recebidoMes.reduce((s, p) => s + (p.netValue ?? p.amount), 0),
      aReceber: aReceberTotal.reduce((s, p) => s + (p.netValue ?? p.amount), 0),
      atrasado: atrasadoTotal,
    },
  });
}

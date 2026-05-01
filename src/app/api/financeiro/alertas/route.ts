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
  const in30Days = new Date(todayEnd.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ago60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [overdueInstallments, todayInstallments, activeSales, recentPayments, activeClients] =
    await Promise.all([
      // Parcelas vencidas
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
        take: 20,
      }),

      // Vencendo hoje
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

      // Vendas ativas com parcelas — para detectar plano acabando
      prisma.sale.findMany({
        where: {
          status: "ativo",
          client: { userId: user.id, status: "ativo" },
        },
        select: {
          id: true,
          description: true,
          client: { select: { id: true, name: true } },
          installments: {
            orderBy: { number: "desc" },
            take: 1,
          },
        },
      }),

      // Últimos pagamentos por cliente (para detectar sem pagamento recente)
      prisma.installment.findMany({
        where: {
          paidAt: { gte: ago60Days },
          sale: { client: { userId: user.id } },
        },
        select: {
          sale: { select: { clientId: true } },
        },
      }),

      // Alunos ativos com pelo menos uma venda
      prisma.client.findMany({
        where: {
          userId: user.id,
          status: "ativo",
          sales: { some: {} },
        },
        select: { id: true, name: true },
      }),
    ]);

  // Planos acabando: last installment due in next 30 days AND not paid
  const endingSoon = activeSales
    .filter((s) => {
      const last = s.installments[0];
      if (!last) return false;
      const due = new Date(last.dueDate);
      return due >= todayStart && due <= in30Days && last.status !== "pago";
    })
    .map((s) => ({
      saleId: s.id,
      description: s.description,
      client: s.client,
      lastDueDate: s.installments[0].dueDate,
    }));

  // Alunos ativos sem pagamento nos últimos 60 dias
  const recentlyPaidIds = new Set(recentPayments.map((p) => p.sale.clientId));
  const noRecentPayment = activeClients
    .filter((c) => !recentlyPaidIds.has(c.id))
    .slice(0, 10);

  return NextResponse.json({
    overdueInstallments,
    todayInstallments,
    endingSoon,
    noRecentPayment,
    counts: {
      overdue: overdueInstallments.length,
      today: todayInstallments.length,
      endingSoon: endingSoon.length,
      noRecentPayment: noRecentPayment.length,
    },
  });
}

// Cria tarefas de cobrança para clientes com parcelas vencidas sem tarefa pendente
export async function POST() {
  const user = await getDefaultUser();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Parcelas vencidas agrupadas por cliente
  const overdueInstallments = await prisma.installment.findMany({
    where: {
      status: { not: "pago" },
      dueDate: { lt: todayStart },
      sale: { client: { userId: user.id } },
    },
    include: {
      sale: {
        select: {
          description: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Agrupa por clientId
  const byClient = new Map<string, { clientId: string; clientName: string; count: number; totalAmount: number }>();
  for (const inst of overdueInstallments) {
    const clientId = inst.sale.client.id;
    const existing = byClient.get(clientId);
    if (existing) {
      existing.count++;
      existing.totalAmount += inst.amount;
    } else {
      byClient.set(clientId, {
        clientId,
        clientName: inst.sale.client.name,
        count: 1,
        totalAmount: inst.amount,
      });
    }
  }

  if (byClient.size === 0) {
    return NextResponse.json({ created: 0 });
  }

  // Verifica quais clientes já têm tarefa financeira pendente
  const existingTasks = await prisma.todoTask.findMany({
    where: {
      userId: user.id,
      type: "financial",
      status: { not: "done" },
      clientId: { in: Array.from(byClient.keys()) },
    },
    select: { clientId: true },
  });
  const clientsWithTask = new Set(existingTasks.map((t) => t.clientId).filter(Boolean) as string[]);

  // Cria tarefas para clientes sem tarefa de cobrança pendente
  const toCreate = Array.from(byClient.values()).filter(
    (c) => !clientsWithTask.has(c.clientId)
  );

  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  await prisma.todoTask.createMany({
    data: toCreate.map((c) => ({
      title: `Cobrar ${c.clientName} — ${c.count} parcela${c.count > 1 ? "s" : ""} vencida${c.count > 1 ? "s" : ""} (${fmt(c.totalAmount)})`,
      type: "financial",
      source: "automatic",
      urgent: true,
      important: true,
      status: "pending",
      userId: user.id,
      clientId: c.clientId,
    })),
  });

  return NextResponse.json({ created: toCreate.length });
}

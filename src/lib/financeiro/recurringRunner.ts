import { prisma } from "@/lib/prisma";
import { ensureFinanceSetup } from "./setup";
import { toDbDate } from "./dates";
import { planRecurringForMonth, type RecurringTxDraft } from "./recurring";

// Idempotente por (recurringCostId, mês): rodar duas vezes não duplica.
export async function generateRecurringForMonth(userId: string, month: string): Promise<RecurringTxDraft[]> {
  await ensureFinanceSetup(userId);
  const costs = await prisma.recurringCost.findMany({ where: { userId } });

  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const existing = await prisma.financialTx.findMany({
    where: { recurringCostId: { not: null }, dueDate: { gte: start, lt: end } },
    select: { recurringCostId: true },
  });

  const drafts = planRecurringForMonth(
    costs,
    month,
    new Set(existing.map((e) => e.recurringCostId).filter((x): x is string => !!x)),
  );
  if (drafts.length === 0) return [];

  await prisma.financialTx.createMany({
    data: drafts.map((d) => ({
      type: "despesa",
      description: d.description,
      amount: d.amount,
      category: d.category,
      status: "pendente",
      dueDate: toDbDate(d.dueDate),
      paymentMethod: d.paymentMethod,
      source: "recorrente",
      recurringCostId: d.recurringCostId,
    })),
  });
  return drafts;
}

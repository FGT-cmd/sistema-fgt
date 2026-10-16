// Custos fixos recorrentes: no dia 1 viram "a pagar" do mês.

import { fmtBRL, monthLabel } from "./dates";

export type RecurringCostRow = {
  id: string;
  category: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  paymentMethod: string | null;
  active: boolean;
};

export type RecurringTxDraft = {
  recurringCostId: string;
  description: string;
  amount: number;
  category: string;
  dueDate: string;
  paymentMethod: string | null;
};

export function dueDateFor(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(day, 1), last);
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function planRecurringForMonth(
  costs: RecurringCostRow[],
  month: string,
  alreadyGenerated: Set<string>,
): RecurringTxDraft[] {
  return costs
    .filter((c) => c.active && !alreadyGenerated.has(c.id))
    .map((c) => ({
      recurringCostId: c.id,
      description: c.description,
      amount: c.amount,
      category: c.category,
      dueDate: dueDateFor(month, c.dayOfMonth),
      paymentMethod: c.paymentMethod,
    }));
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function buildMonthlyMessage(p: { month: string; created: RecurringTxDraft[]; reviewCount: number }): string {
  const lines = ["🗓️ *Virada do mês*", ""];
  if (p.created.length > 0) {
    lines.push(`📌 Lancei os fixos de ${monthLabel(p.month)} como a pagar:`);
    for (const d of p.created) {
      lines.push(`• ${d.description} ${fmtBRL(d.amount)} (dia ${Number(d.dueDate.slice(8, 10))})`);
    }
    lines.push("");
  }
  lines.push(
    `📎 Fechamento de ${monthLabel(previousMonth(p.month))}: me manda aqui o extrato do C6 e a fatura do Nubank (OFX ou CSV).`,
  );
  if (p.reviewCount > 0) {
    lines.push(`🟡 ${p.reviewCount} lançamentos esperando revisão no painel.`);
  }
  return lines.join("\n");
}

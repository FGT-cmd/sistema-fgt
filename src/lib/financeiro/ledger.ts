// Livro-razão unificado: lançamentos reais + caixa das vendas, cada item com
// UMA data efetiva. Realizado conta no mês do pagamento; pendente, no vencimento.
// Faturamento de venda fica de fora: aqui só interessa dinheiro (caixa).

import type { SaleTx } from "./saleTxs";
import { addDays, isoDate } from "./dates";

export type EntryKind = "receita" | "despesa";
export type EntryStatus = "pago" | "pendente" | "cancelado";

export type LedgerEntry = {
  ref: string;
  kind: EntryKind;
  amount: number;
  category: string;
  description: string;
  status: EntryStatus;
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  clientName: string | null;
  source: string;
  needsReview: boolean;
};

export type TxRow = {
  id: string;
  type: string;
  description: string;
  amount: number;
  category: string;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  paymentMethod: string | null;
  source: string | null;
  needsReview: boolean;
  installmentId: string | null;
  client: { name: string } | null;
};

export function normalizeStatus(s: string): EntryStatus {
  if (s === "pago") return "pago";
  if (s === "cancelado") return "cancelado";
  return "pendente";
}

export function txToEntry(t: TxRow): LedgerEntry {
  const status = normalizeStatus(t.status);
  const due = t.dueDate ? isoDate(t.dueDate) : null;
  const paid = t.paidAt ? isoDate(t.paidAt) : null;
  const created = isoDate(t.createdAt);
  const date = status === "pago" ? (paid ?? due ?? created) : (due ?? created);
  return {
    ref: `tx:${t.id}`,
    kind: t.type === "receita" ? "receita" : "despesa",
    amount: t.amount,
    category: t.category,
    description: t.description,
    status,
    date,
    dueDate: due,
    paidAt: paid,
    paymentMethod: t.paymentMethod,
    clientName: t.client?.name ?? null,
    source: t.source ?? "manual",
    needsReview: t.needsReview,
  };
}

export function saleCaixaToEntry(s: SaleTx): LedgerEntry | null {
  if (s._flow !== "caixa" || !s._installmentId) return null;
  const date = (s.dueDate ?? s.paidAt)?.slice(0, 10);
  if (!date) return null;
  return {
    ref: `inst:${s._installmentId}`,
    kind: "receita",
    amount: s.amount,
    category: "Venda",
    description: s.description,
    status: normalizeStatus(s.status),
    date,
    dueDate: s.dueDate?.slice(0, 10) ?? null,
    paidAt: s.paidAt?.slice(0, 10) ?? null,
    paymentMethod: s.paymentMethod,
    clientName: s.client.name,
    source: "venda",
    needsReview: false,
  };
}

export function buildLedger(txs: TxRow[], saleTxs: SaleTx[]): LedgerEntry[] {
  const fromSales = saleTxs.map(saleCaixaToEntry).filter((e): e is LedgerEntry => e !== null);
  return [...txs.map(txToEntry), ...fromSales]
    .filter((e) => e.status !== "cancelado")
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function entriesInMonth(entries: LedgerEntry[], month: string): LedgerEntry[] {
  return entries.filter((e) => e.date.slice(0, 7) === month);
}

export function entriesBetween(entries: LedgerEntry[], from: string, to: string): LedgerEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to);
}

// Contas em aberto relevantes para interpretar "boleto contadora foi pago":
// vencidas há até 60 dias ou vencendo nos próximos 45.
export function selectOpenItems(entries: LedgerEntry[], today: string): LedgerEntry[] {
  const from = addDays(today, -60);
  const to = addDays(today, 45);
  return entries
    .filter((e) => e.status === "pendente")
    .filter((e) => {
      const d = e.dueDate ?? e.date;
      return d >= from && d <= to;
    })
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date))
    .slice(0, 80);
}

export function splitRef(ref: string): ["tx" | "inst", string] {
  const i = ref.indexOf(":");
  const type = ref.slice(0, i) === "inst" ? "inst" : "tx";
  return [type, ref.slice(i + 1)];
}

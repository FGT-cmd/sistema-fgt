// Decide o destino de cada linha de extrato: nova, duplicada ou baixa de uma
// conta em aberto. Cada lançamento do livro-razão absorve no máximo uma linha.

import { daysBetween } from "./dates";
import type { LedgerEntry } from "./ledger";

export type StatementRow = {
  date: string;
  amount: number; // positivo entra, negativo sai
  description: string;
  externalId: string;
};

export type DedupeVerdict =
  | { verdict: "new" }
  | { verdict: "duplicate"; reason: "externalId" | "venda" | "manual"; ref: string | null }
  | { verdict: "settles"; ref: string };

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;

function dedupeRow(
  row: StatementRow,
  ledger: LedgerEntry[],
  knownExternalIds: Set<string>,
  used: Set<string>,
): DedupeVerdict {
  if (knownExternalIds.has(row.externalId)) {
    return { verdict: "duplicate", reason: "externalId", ref: null };
  }
  const kind = row.amount >= 0 ? "receita" : "despesa";
  const abs = Math.abs(row.amount);
  const free = (e: LedgerEntry) => e.kind === kind && !used.has(e.ref);
  const take = (e: LedgerEntry) => {
    used.add(e.ref);
    return e.ref;
  };

  const venda = ledger.find(
    (e) => free(e) && e.source === "venda" && e.status === "pago"
      && near(e.amount, abs, 0.05) && daysBetween(e.date, row.date) <= 3,
  );
  if (venda) return { verdict: "duplicate", reason: "venda", ref: take(venda) };

  const manual = ledger.find(
    (e) => free(e) && e.source !== "venda" && e.status === "pago"
      && near(e.amount, abs, 0.01) && daysBetween(e.date, row.date) <= 2,
  );
  if (manual) return { verdict: "duplicate", reason: "manual", ref: take(manual) };

  const open = ledger.find(
    (e) => free(e) && e.status === "pendente"
      && near(e.amount, abs, Math.max(abs * 0.01, 0.01))
      && daysBetween(e.dueDate ?? e.date, row.date) <= 5,
  );
  if (open) return { verdict: "settles", ref: take(open) };

  return { verdict: "new" };
}

export function dedupeRows(
  rows: StatementRow[],
  ledger: LedgerEntry[],
  knownExternalIds: Set<string>,
): { row: StatementRow; result: DedupeVerdict }[] {
  const used = new Set<string>();
  return rows.map((row) => ({ row, result: dedupeRow(row, ledger, knownExternalIds, used) }));
}

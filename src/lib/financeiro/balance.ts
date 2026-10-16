// Saldo estimado por conta = último saldo de extrato + movimentos realizados
// depois dele naquela conta. Nunca é "ao vivo"; a resposta sempre diz a base.

import { round2 } from "./dates";
import type { LedgerEntry } from "./ledger";
import { accountOfMethod, SALE_DEFAULT_ACCOUNT, type Vocab } from "./vocab";

export type BalanceSnapshot = { account: string; balance: number; asOf: string };

export type BalanceEstimate =
  | { account: string; balance: number; baseDate: string; movementsAfter: number }
  | { account: string; balance: null; reason: "sem_extrato" };

export function latestSnapshot(snapshots: BalanceSnapshot[], account: string): BalanceSnapshot | null {
  return (
    snapshots
      .filter((s) => s.account === account)
      .sort((a, b) => b.asOf.localeCompare(a.asOf))[0] ?? null
  );
}

// Conta de um lançamento: pela forma de pagamento (inclui nomes antigos);
// parcela de venda sem forma é InfinitePay. null = não dá pra saber.
export function entryAccount(vocab: Vocab, e: Pick<LedgerEntry, "paymentMethod" | "source">): string | null {
  if (e.paymentMethod) return accountOfMethod(vocab, e.paymentMethod);
  return e.source === "venda" ? SALE_DEFAULT_ACCOUNT : null;
}

export function estimateBalance(
  account: string,
  snapshot: BalanceSnapshot | null,
  ledger: LedgerEntry[],
  accountOf: (e: LedgerEntry) => string | null,
): BalanceEstimate {
  if (!snapshot) return { account, balance: null, reason: "sem_extrato" };
  const after = ledger.filter(
    (e) => e.status === "pago" && e.date > snapshot.asOf && accountOf(e) === account,
  );
  const delta = after.reduce((s, e) => s + (e.kind === "receita" ? e.amount : -e.amount), 0);
  return {
    account,
    balance: round2(snapshot.balance + delta),
    baseDate: snapshot.asOf,
    movementsAfter: after.length,
  };
}

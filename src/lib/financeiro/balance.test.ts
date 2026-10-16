import { describe, it, expect } from "vitest";
import { estimateBalance, latestSnapshot } from "./balance";
import type { LedgerEntry } from "./ledger";

const e = (p: Partial<LedgerEntry>): LedgerEntry => ({
  ref: "tx:1", kind: "despesa", amount: 0, category: "x", description: "x", status: "pago",
  date: "2026-10-05", dueDate: null, paidAt: null, paymentMethod: "Pix/débito PJ", clientName: null,
  source: "manual", needsReview: false, ...p,
});
const accountOf = (m: string | null) => (m === "Pix/débito PJ" || m === "Pix C6" ? "C6" : m === "Cartão crédito (Natália)" ? "Cartão Natália" : null);

describe("balance", () => {
  it("saldo do extrato + movimentos realizados depois, só da conta pedida", () => {
    const ledger = [
      e({ ref: "tx:antes", amount: 999, date: "2026-09-30" }),
      e({ ref: "tx:saida", amount: 100, date: "2026-10-05" }),
      e({ ref: "tx:entrada", kind: "receita", amount: 1800, date: "2026-10-06", paymentMethod: "Pix C6" }),
      e({ ref: "tx:pendente", amount: 500, status: "pendente", date: "2026-10-07" }),
      e({ ref: "tx:outra", amount: 50, date: "2026-10-08", paymentMethod: "Cartão crédito (Natália)" }),
    ];
    const r = estimateBalance("C6", { account: "C6", balance: 4000, asOf: "2026-10-01" }, ledger, accountOf);
    expect(r).toEqual({ account: "C6", balance: 5700, baseDate: "2026-10-01", movementsAfter: 2 });
  });

  it("sem extrato não chuta saldo", () => {
    expect(estimateBalance("C6", null, [], accountOf)).toEqual({ account: "C6", balance: null, reason: "sem_extrato" });
  });

  it("pega o snapshot mais recente da conta", () => {
    const s = latestSnapshot([
      { account: "C6", balance: 1, asOf: "2026-09-01" },
      { account: "C6", balance: 2, asOf: "2026-10-01" },
      { account: "Nubank PF", balance: 3, asOf: "2026-10-05" },
    ], "C6");
    expect(s?.balance).toBe(2);
  });
});

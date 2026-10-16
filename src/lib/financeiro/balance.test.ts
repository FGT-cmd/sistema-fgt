import { describe, it, expect } from "vitest";
import { entryAccount, estimateBalance, latestSnapshot } from "./balance";
import type { LedgerEntry } from "./ledger";
import { buildVocab, planSeed, type ConfigRow } from "./vocab";

const e = (p: Partial<LedgerEntry>): LedgerEntry => ({
  ref: "tx:1", kind: "despesa", amount: 0, category: "x", description: "x", status: "pago",
  date: "2026-10-05", dueDate: null, paidAt: null, paymentMethod: "Pix/débito PJ", clientName: null,
  source: "manual", needsReview: false, ...p,
});
const accountOf = ({ paymentMethod: m }: LedgerEntry) => (m === "Pix/débito PJ" || m === "Pix C6" ? "C6" : m === "Cartão crédito (Natália)" ? "Cartão Natália" : null);
const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const vocab = buildVocab(seedRows);

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

  it("conta do lançamento: vocabulário, nomes antigos e parcela de venda sem forma", () => {
    expect(entryAccount(vocab, { paymentMethod: "Pix C6", source: "manual" })).toBe("C6");
    expect(entryAccount(vocab, { paymentMethod: "Pix", source: "manual" })).toBe("C6");
    expect(entryAccount(vocab, { paymentMethod: "Cartão", source: "venda" })).toBe("InfinitePay");
    expect(entryAccount(vocab, { paymentMethod: null, source: "venda" })).toBe("InfinitePay");
    expect(entryAccount(vocab, { paymentMethod: null, source: "manual" })).toBeNull();
    expect(entryAccount(vocab, { paymentMethod: "Plataforma", source: "venda" })).toBeNull();
  });

  it("dinheiro gravado com nome antigo entra no saldo da conta certa", () => {
    const ledger = [
      e({ ref: "tx:pixantigo", kind: "receita", amount: 300, date: "2026-10-05", paymentMethod: "pix" }),
      e({ ref: "inst:semforma", kind: "receita", amount: 900, date: "2026-10-05", paymentMethod: null, source: "venda" }),
    ];
    const of = (x: LedgerEntry) => entryAccount(vocab, x);
    expect(estimateBalance("C6", { account: "C6", balance: 1000, asOf: "2026-10-01" }, ledger, of)).toMatchObject({ balance: 1300, movementsAfter: 1 });
    expect(estimateBalance("InfinitePay", { account: "InfinitePay", balance: 0, asOf: "2026-10-01" }, ledger, of)).toMatchObject({ balance: 900, movementsAfter: 1 });
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

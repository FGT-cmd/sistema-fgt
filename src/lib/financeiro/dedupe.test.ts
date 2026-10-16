import { describe, it, expect } from "vitest";
import { dedupeRows, type StatementRow } from "./dedupe";
import type { LedgerEntry } from "./ledger";

function entry(p: Partial<LedgerEntry> & Pick<LedgerEntry, "ref">): LedgerEntry {
  return {
    kind: "despesa", amount: 100, category: "Outras despesas", description: "x", status: "pago",
    date: "2026-09-10", dueDate: null, paidAt: "2026-09-10", paymentMethod: null, clientName: null,
    source: "manual", needsReview: false, ...p,
  };
}
const row = (p: Partial<StatementRow>): StatementRow => ({
  date: "2026-09-10", amount: -100, description: "PIX", externalId: "C6|x#1", ...p,
});

describe("dedupeRows", () => {
  it("pula linha já importada (mesmo externalId)", () => {
    const [r] = dedupeRows([row({ externalId: "C6|fit|123" })], [], new Set(["C6|fit|123"]));
    expect(r.result).toEqual({ verdict: "duplicate", reason: "externalId", ref: null });
  });

  it("pula recebimento que já veio da InfinitePay (valor líquido, até 3 dias)", () => {
    const ledger = [entry({ ref: "inst:i1", kind: "receita", source: "venda", amount: 1748.7, date: "2026-09-02" })];
    const [r] = dedupeRows([row({ amount: 1748.7, date: "2026-09-04" })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "duplicate", reason: "venda", ref: "inst:i1" });
  });

  it("propõe baixa de conta a pagar em aberto (valor ±1%, até 5 dias do vencimento)", () => {
    const ledger = [entry({ ref: "tx:cont", status: "pendente", amount: 398, dueDate: "2026-09-10", date: "2026-09-10", paidAt: null })];
    const [r] = dedupeRows([row({ amount: -401, date: "2026-09-12" })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "settles", ref: "tx:cont" });
  });

  it("pula saída já lançada à mão com mesmo valor e data próxima", () => {
    const ledger = [entry({ ref: "tx:mfit", amount: 39.9, date: "2026-09-09" })];
    const [r] = dedupeRows([row({ amount: -39.9, date: "2026-09-10" })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "duplicate", reason: "manual", ref: "tx:mfit" });
  });

  it("um lançamento só absorve uma linha: a segunda compra igual é nova", () => {
    const ledger = [entry({ ref: "tx:cafe", amount: 27.1 })];
    const res = dedupeRows(
      [row({ amount: -27.1, externalId: "a#1" }), row({ amount: -27.1, externalId: "a#2" })],
      ledger, new Set(),
    );
    expect(res.map((r) => r.result.verdict)).toEqual(["duplicate", "new"]);
  });

  it("não confunde entrada com saída de mesmo valor", () => {
    const ledger = [entry({ ref: "tx:out", amount: 200 })];
    const [r] = dedupeRows([row({ amount: 200 })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "new" });
  });
});

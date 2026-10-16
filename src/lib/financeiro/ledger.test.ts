import { describe, it, expect } from "vitest";
import {
  buildLedger, txToEntry, entriesInMonth, entriesBetween, selectOpenItems, splitRef, type TxRow,
} from "./ledger";
import type { SaleTx } from "./saleTxs";

function tx(p: Partial<TxRow> & Pick<TxRow, "id">): TxRow {
  return {
    type: "despesa", description: "x", amount: 10, category: "Outras despesas", status: "pago",
    dueDate: null, paidAt: null, createdAt: new Date("2026-07-01T12:00:00Z"), paymentMethod: null,
    source: null, needsReview: false, installmentId: null, client: null, ...p,
  };
}

function saleLine(p: Partial<SaleTx> & Pick<SaleTx, "id" | "_flow">): SaleTx {
  return {
    type: "receita", description: "Consultoria anual", amount: 1800, category: "Caixa", status: "pago",
    dueDate: "2026-08-05T12:00:00.000Z", paidAt: "2026-08-04T12:00:00.000Z", paymentMethod: "Pix",
    notes: null, client: { id: "c1", name: "Aleska" }, _saleId: "s1", _installmentId: "i1", ...p,
  };
}

describe("ledger", () => {
  it("lançamento pago conta no mês do pagamento, não do vencimento (defeito #2)", () => {
    const e = txToEntry(tx({
      id: "a", dueDate: new Date("2026-07-15T12:00:00Z"), paidAt: new Date("2026-08-01T12:00:00Z"),
    }));
    expect(e.date).toBe("2026-08-01");
    expect(entriesInMonth([e], "2026-07")).toHaveLength(0);
    expect(entriesInMonth([e], "2026-08")).toHaveLength(1);
  });

  it("pendente usa o vencimento e 'atrasado' vira pendente", () => {
    const e = txToEntry(tx({ id: "b", status: "atrasado", dueDate: new Date("2026-10-31T12:00:00Z") }));
    expect(e.status).toBe("pendente");
    expect(e.date).toBe("2026-10-31");
    expect(e.ref).toBe("tx:b");
    expect(e.source).toBe("manual");
  });

  it("de venda entra só a linha de caixa, com ref da parcela", () => {
    const ledger = buildLedger([], [
      saleLine({ id: "fat_i1", _flow: "faturamento", category: "Faturamento" }),
      saleLine({ id: "inst_i1", _flow: "caixa" }),
    ]);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ ref: "inst:i1", kind: "receita", source: "venda", date: "2026-08-05", clientName: "Aleska" });
  });

  it("cancelados ficam de fora e a lista sai ordenada por data", () => {
    const ledger = buildLedger([
      tx({ id: "z", paidAt: new Date("2026-09-10T12:00:00Z") }),
      tx({ id: "y", paidAt: new Date("2026-09-01T12:00:00Z") }),
      tx({ id: "x", status: "cancelado", paidAt: new Date("2026-09-05T12:00:00Z") }),
    ], []);
    expect(ledger.map((e) => e.ref)).toEqual(["tx:y", "tx:z"]);
    expect(entriesBetween(ledger, "2026-09-02", "2026-09-30").map((e) => e.ref)).toEqual(["tx:z"]);
  });

  it("itens em aberto: só pendentes numa janela útil em volta de hoje", () => {
    const ledger = buildLedger([
      tx({ id: "velho", status: "pendente", dueDate: new Date("2026-05-01T12:00:00Z") }),
      tx({ id: "perto", status: "pendente", dueDate: new Date("2026-10-31T12:00:00Z") }),
      tx({ id: "pago", status: "pago", paidAt: new Date("2026-10-10T12:00:00Z") }),
    ], []);
    expect(selectOpenItems(ledger, "2026-10-16").map((e) => e.ref)).toEqual(["tx:perto"]);
  });

  it("splitRef separa o tipo do id", () => {
    expect(splitRef("tx:abc")).toEqual(["tx", "abc"]);
    expect(splitRef("inst:def")).toEqual(["inst", "def"]);
  });
});

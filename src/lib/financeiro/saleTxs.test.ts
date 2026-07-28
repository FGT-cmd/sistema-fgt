import { describe, it, expect } from "vitest";
import { buildSaleTxs, type SaleInput } from "./saleTxs";

const client = { id: "c1", name: "João" };

function sale(over: Partial<SaleInput> = {}): SaleInput {
  return {
    id: "s1",
    description: "Consultoria",
    negotiationType: "pix",
    grossValue: null,
    paymentMethod: "Pix",
    installmentsCount: 1,
    createdAt: "2026-07-27T00:00:00.000Z",
    client,
    installments: [],
    ...over,
  };
}

describe("buildSaleTxs — comportamento atual", () => {
  it("venda no Pix gera um lancamento por parcela pelo valor bruto", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          paidAt: null, status: "pendente", label: null, paymentMethod: "Pix", cashDate: null },
      ],
    })], new Set());

    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(500);
    expect(txs[0]._installmentId).toBe("i1");
  });

  it("venda no cartao gera lancamento de faturamento mais o de caixa pelo liquido", () => {
    const txs = buildSaleTxs([sale({
      negotiationType: "card",
      grossValue: 1000,
      installments: [
        { id: "i1", number: 1, amount: 1000, netValue: 950, dueDate: "2026-07-28",
          paidAt: null, status: "pendente", label: null, paymentMethod: "Cartão", cashDate: null },
      ],
    })], new Set());

    expect(txs).toHaveLength(2);
    expect(txs[0].category).toBe("Faturamento");
    expect(txs[0].amount).toBe(1000);
    expect(txs[1].category).toBe("Caixa");
    expect(txs[1].amount).toBe(950);
  });

  it("ignora parcelas ja lancadas manualmente", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          paidAt: null, status: "pendente", label: null, paymentMethod: "Pix", cashDate: null },
      ],
    })], new Set(["i1"]));

    expect(txs).toHaveLength(0);
  });
});

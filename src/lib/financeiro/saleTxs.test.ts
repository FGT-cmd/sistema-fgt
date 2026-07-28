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

describe("buildSaleTxs — por linha", () => {
  it("cada parcela gera faturamento pelo bruto e caixa pelo liquido", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 1000, netValue: 950, dueDate: "2026-07-27",
          cashDate: "2026-07-28", paidAt: null, status: "pendente",
          label: "Entrada", paymentMethod: "Cartão" },
      ],
    })], new Set());

    const fat = txs.find(t => t.category === "Faturamento");
    const cx  = txs.find(t => t.category === "Caixa");

    expect(fat?.amount).toBe(1000);
    expect(fat?.dueDate).toBe("2026-07-27");
    expect(cx?.amount).toBe(950);
    expect(cx?.dueDate).toBe("2026-07-28");
  });

  it("usa a forma de pagamento da linha, nao a da venda", () => {
    const txs = buildSaleTxs([sale({
      paymentMethod: "Pix",
      installments: [
        { id: "i1", number: 1, amount: 600, netValue: 600, dueDate: "2026-08-27",
          cashDate: "2026-08-28", paidAt: null, status: "pendente",
          label: "Restante", paymentMethod: "Cartão" },
      ],
    })], new Set());

    expect(txs.every(t => t.paymentMethod === "Cartão")).toBe(true);
  });

  it("linhas da mesma venda podem ter formas de pagamento diferentes", () => {
    const txs = buildSaleTxs([sale({
      installmentsCount: 2,
      installments: [
        { id: "i1", number: 1, amount: 400, netValue: 400, dueDate: "2026-07-27",
          cashDate: "2026-07-27", paidAt: null, status: "pago",
          label: "Entrada", paymentMethod: "Pix" },
        { id: "i2", number: 2, amount: 600, netValue: 570, dueDate: "2026-08-27",
          cashDate: "2026-08-28", paidAt: null, status: "pendente",
          label: "Restante", paymentMethod: "Cartão" },
      ],
    })], new Set());

    const porId = (id: string) => txs.filter(t => t._installmentId === id);
    expect(porId("i1").every(t => t.paymentMethod === "Pix")).toBe(true);
    expect(porId("i2").every(t => t.paymentMethod === "Cartão")).toBe(true);
  });

  it("sem cashDate usa a dueDate como fallback", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          cashDate: null, paidAt: null, status: "pendente",
          label: null, paymentMethod: null },
      ],
    })], new Set());

    const cx = txs.find(t => t.category === "Caixa");
    expect(cx?.dueDate).toBe("2026-07-27");
    expect(cx?.amount).toBe(500);
  });

  it("ignora parcelas ja lancadas manualmente", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          cashDate: null, paidAt: null, status: "pendente",
          label: null, paymentMethod: "Pix" },
      ],
    })], new Set(["i1"]));

    expect(txs).toHaveLength(0);
  });

  it("gera exatamente os ids inst_<id> (caixa) e fat_<id> (faturamento)", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: 480, dueDate: "2026-07-27",
          cashDate: "2026-07-28", paidAt: null, status: "pendente",
          label: null, paymentMethod: "Pix" },
      ],
    })], new Set());

    const cx = txs.find(t => t.category === "Caixa");
    const fat = txs.find(t => t.category === "Faturamento");
    expect(cx?.id).toBe("inst_i1");
    expect(fat?.id).toBe("fat_i1");
  });

  it("cada parcela gera exatamente duas linhas (faturamento e caixa)", () => {
    const txs = buildSaleTxs([sale({
      installmentsCount: 2,
      installments: [
        { id: "i1", number: 1, amount: 400, netValue: 400, dueDate: "2026-07-27",
          cashDate: "2026-07-27", paidAt: null, status: "pago",
          label: "Entrada", paymentMethod: "Pix" },
        { id: "i2", number: 2, amount: 600, netValue: 570, dueDate: "2026-08-27",
          cashDate: "2026-08-28", paidAt: null, status: "pendente",
          label: "Restante", paymentMethod: "Cartão" },
      ],
    })], new Set());

    expect(txs).toHaveLength(4);
    expect(txs.filter(t => t._installmentId === "i1")).toHaveLength(2);
    expect(txs.filter(t => t._installmentId === "i2")).toHaveLength(2);
  });

  it("sem forma de pagamento na linha usa a da venda", () => {
    const txs = buildSaleTxs([sale({
      paymentMethod: "Boleto",
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: 480, dueDate: "2026-07-27",
          cashDate: "2026-07-28", paidAt: null, status: "pendente",
          label: null, paymentMethod: null },
      ],
    })], new Set());

    expect(txs.every(t => t.paymentMethod === "Boleto")).toBe(true);
  });

  it("netValue zero permanece zero e nao vira o valor bruto", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: 0, dueDate: "2026-07-27",
          cashDate: "2026-07-28", paidAt: null, status: "pendente",
          label: null, paymentMethod: "Pix" },
      ],
    })], new Set());

    const cx = txs.find(t => t.category === "Caixa");
    expect(cx?.amount).toBe(0);
  });

  it("marca cada linha com o _flow correto e a caixa carrega o bruto original", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 1000, netValue: 950, dueDate: "2026-07-27",
          cashDate: "2026-07-28", paidAt: null, status: "pendente",
          label: null, paymentMethod: "Cartão" },
      ],
    })], new Set());

    const fat = txs.find(t => t.category === "Faturamento");
    const cx  = txs.find(t => t.category === "Caixa");

    expect(fat?._flow).toBe("faturamento");
    expect(cx?._flow).toBe("caixa");
    // A linha de Caixa exibe o líquido, mas deve preservar o bruto/vencimento
    // originais para que um edit sem alterações não corrompa a parcela.
    expect(cx?._grossAmount).toBe(1000);
    expect(cx?._grossDueDate).toBe("2026-07-27");
  });
});

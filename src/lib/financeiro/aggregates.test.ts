import { describe, it, expect } from "vitest";
import {
  countsAsCaixa,
  countsAsFaturamento,
  sumCaixa,
  sumFaturamento,
  type FlowTx,
} from "./aggregates";

// Duas linhas derivadas da MESMA parcela: bruto 1000 (faturamento) e
// líquido 950 (caixa). Somar as duas seria contar a venda em dobro.
const fat: FlowTx = { amount: 1000, _flow: "faturamento" };
const caixa: FlowTx = { amount: 950, _flow: "caixa" };
// Lançamento real, digitado à mão: não tem _flow.
const manual: FlowTx = { amount: 200 };

describe("countsAsCaixa / countsAsFaturamento", () => {
  it("linha de caixa conta só no caixa", () => {
    expect(countsAsCaixa(caixa)).toBe(true);
    expect(countsAsFaturamento(caixa)).toBe(false);
  });

  it("linha de faturamento conta só no faturamento", () => {
    expect(countsAsFaturamento(fat)).toBe(true);
    expect(countsAsCaixa(fat)).toBe(false);
  });

  it("lançamento real (sem _flow) conta nas DUAS agregações", () => {
    // Este é o caso que nunca pode regredir: uma receita avulsa digitada
    // à mão é dinheiro e é faturamento ao mesmo tempo.
    expect(countsAsCaixa(manual)).toBe(true);
    expect(countsAsFaturamento(manual)).toBe(true);
  });

  it("_flow explicitamente nulo é tratado como lançamento real", () => {
    const t: FlowTx = { amount: 50, _flow: null };
    expect(countsAsCaixa(t)).toBe(true);
    expect(countsAsFaturamento(t)).toBe(true);
  });
});

describe("sumCaixa / sumFaturamento", () => {
  it("não conta a mesma parcela duas vezes", () => {
    expect(sumCaixa([fat, caixa])).toBe(950);
    expect(sumFaturamento([fat, caixa])).toBe(1000);
  });

  it("inclui lançamentos reais nas duas somas", () => {
    expect(sumCaixa([fat, caixa, manual])).toBe(1150);
    expect(sumFaturamento([fat, caixa, manual])).toBe(1200);
  });

  it("lista vazia soma zero", () => {
    expect(sumCaixa([])).toBe(0);
    expect(sumFaturamento([])).toBe(0);
  });

  it("uma venda de 2 parcelas não dobra o total", () => {
    const txs: FlowTx[] = [
      { amount: 400, _flow: "faturamento" },
      { amount: 400, _flow: "caixa" },
      { amount: 800, _flow: "faturamento" },
      { amount: 770, _flow: "caixa" },
    ];
    expect(sumFaturamento(txs)).toBe(1200);
    expect(sumCaixa(txs)).toBe(1170);
  });
});

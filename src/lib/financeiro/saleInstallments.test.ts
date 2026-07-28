import { describe, it, expect } from "vitest";
import { buildInstallmentCreateData } from "./saleInstallments";

const now = new Date("2026-07-27T10:00:00.000Z");

describe("buildInstallmentCreateData", () => {
  it("numera as parcelas na ordem recebida", () => {
    const rows = buildInstallmentCreateData([
      { amount: 400, dueDate: "2026-07-27" },
      { amount: 800, dueDate: "2026-08-27" },
    ], { now });
    expect(rows.map(r => r.number)).toEqual([1, 2]);
  });

  it("netValue zero permanece zero (linha consumida pela taxa)", () => {
    // Regressão: `if (inst.netValue)` descartava o zero e deixava a coluna
    // nula, fazendo o caixa reportar o bruto — dinheiro que nunca entrou.
    const [row] = buildInstallmentCreateData([
      { amount: 1000, netValue: 0, dueDate: "2026-07-27" },
    ], { now });
    expect(row.netValue).toBe(0);
  });

  it("netValue ausente não grava a coluna (compatibilidade com vendas antigas)", () => {
    const [row] = buildInstallmentCreateData([
      { amount: 1000, dueDate: "2026-07-27" },
    ], { now });
    expect(row.netValue).toBeUndefined();
  });

  it("netValue nulo não grava a coluna", () => {
    const [row] = buildInstallmentCreateData([
      { amount: 1000, netValue: null, dueDate: "2026-07-27" },
    ], { now });
    expect(row.netValue).toBeUndefined();
  });

  it("aceita netValue e amount como string", () => {
    const [row] = buildInstallmentCreateData([
      { amount: "1000", netValue: "950.5", dueDate: "2026-07-27" },
    ], { now });
    expect(row.amount).toBe(1000);
    expect(row.netValue).toBe(950.5);
  });

  it("marca paidAt só nas linhas pagas", () => {
    const rows = buildInstallmentCreateData([
      { amount: 400, dueDate: "2026-07-27", paid: true },
      { amount: 800, dueDate: "2026-08-27" },
    ], { now });
    expect(rows[0].status).toBe("pago");
    expect(rows[0].paidAt).toEqual(now);
    expect(rows[1].status).toBe("pendente");
    expect(rows[1].paidAt).toBeUndefined();
  });

  it("markAllPaid marca todas as linhas", () => {
    const rows = buildInstallmentCreateData([
      { amount: 400, dueDate: "2026-07-27" },
      { amount: 800, dueDate: "2026-08-27" },
    ], { markAllPaid: true, now });
    expect(rows.every(r => r.status === "pago")).toBe(true);
    expect(rows.every(r => r.paidAt === now)).toBe(true);
  });

  it("preserva cashDate, label e paymentMethod da linha", () => {
    const [row] = buildInstallmentCreateData([
      { amount: 600, dueDate: "2026-08-27", cashDate: "2026-08-28",
        label: "Restante", paymentMethod: "Cartão" },
    ], { now });
    expect(row.cashDate?.toISOString().slice(0, 10)).toBe("2026-08-28");
    expect(row.dueDate.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(row.label).toBe("Restante");
    expect(row.paymentMethod).toBe("Cartão");
  });

  it("lista vazia gera nenhuma parcela", () => {
    expect(buildInstallmentCreateData([], { now })).toEqual([]);
  });
});

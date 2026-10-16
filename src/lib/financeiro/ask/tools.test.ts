import { describe, it, expect } from "vitest";
import { openBills, periodSummary, monthResult, spendingByCategory, goalsProgress, balances, toReview, runAskTool, type AskData } from "./tools";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { LedgerEntry } from "../ledger";

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const e = (p: Partial<LedgerEntry> & Pick<LedgerEntry, "ref">): LedgerEntry => ({
  kind: "despesa", amount: 100, category: "Outras despesas", description: "x", status: "pago", date: "2026-10-05",
  dueDate: null, paidAt: "2026-10-05", paymentMethod: "Pix/débito PJ", clientName: null, source: "manual",
  needsReview: false, ...p,
});
const data: AskData = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  snapshots: [{ account: "C6", balance: 5000, asOf: "2026-10-01" }],
  monthlyGoal: 35000,
  goals: { reserva_fin: 10000 },
  ledger: [
    e({ ref: "tx:rec", kind: "receita", amount: 10000, category: "Consultoria anual", paymentMethod: "Pix C6" }),
    e({ ref: "tx:pro", amount: 4000, category: "Prolabore" }),
    e({ ref: "tx:ads", amount: 1000, category: "Tráfego pago", paymentMethod: "Cartão crédito (Nubank PF)" }),
    e({ ref: "tx:res", amount: 500, category: "Reserva Financeira" }),
    e({ ref: "tx:cref", amount: 444, status: "pendente", date: "2026-10-31", dueDate: "2026-10-31", paidAt: null, description: "CREF" }),
    e({ ref: "tx:atras", amount: 398, status: "pendente", date: "2026-10-10", dueDate: "2026-10-10", paidAt: null, description: "Contabilidade" }),
    e({ ref: "tx:rev", amount: 57, needsReview: true, description: "ChatGPT", date: "2026-10-15", paidAt: "2026-10-15" }),
  ],
};

describe("ferramentas de leitura", () => {
  it("contas a pagar até hoje incluem as atrasadas", () => {
    const r = openBills(data, { tipo: "pagar", ate: "2026-10-16" });
    expect(r.quantidade).toBe(1);
    expect(r.itens[0]).toMatchObject({ descricao: "Contabilidade", atrasado: true });
    expect(openBills(data, { tipo: "pagar", ate: null }).total).toBe(842);
  });

  it("resumo do período soma entradas e saídas realizadas", () => {
    expect(periodSummary(data, { de: "2026-10-01", ate: "2026-10-31" })).toMatchObject({
      entradas: 10000, saidas: 5557, saldo: 4443,
    });
  });

  it("resultado do mês segue a DRE da planilha (destinação fica abaixo do resultado)", () => {
    const r = monthResult(data, { mes: "2026-10" });
    expect(r).toMatchObject({ receitas: 10000, custosFixos: 4000, investimentos: 1000, despesas: 57, destinacao: 500 });
    expect(r.resultado).toBe(4943);
    expect(r.margem).toBe(49.43);
  });

  it("gastos por categoria filtram pelo nome", () => {
    expect(spendingByCategory(data, { de: "2026-10-01", ate: "2026-10-31", categoria: "trafego" }))
      .toEqual({ total: 1000, categorias: [{ categoria: "Tráfego pago", total: 1000 }] });
  });

  it("metas: progresso do mês e reservas acumuladas", () => {
    expect(goalsProgress(data, { mes: "2026-10" })).toMatchObject({
      metaMensal: 35000, recebidoNoMes: 10000, percentual: 28.57,
      reservaFinanceira: { acumulado: 500, meta: 10000 },
    });
  });

  it("saldo estimado por conta e lançamentos a revisar", () => {
    const c6 = balances(data, { conta: "c6" }).find((b) => b.conta === "C6");
    expect(c6).toMatchObject({ saldoEstimado: 5000 + 10000 - 4000 - 500 - 57, baseExtrato: "2026-10-01", lancamentosJaIncluidos: 4 });
    expect(toReview(data).itens.map((i) => i.descricao)).toEqual(["ChatGPT"]);
  });

  it("runAskTool despacha pelo nome e acusa ferramenta desconhecida", () => {
    expect(runAskTool("contas_em_aberto", { tipo: "pagar", ate: "2026-10-16" }, data)).toMatchObject({ quantidade: 1 });
    expect(runAskTool("nao_existe", {}, data)).toEqual({ erro: "ferramenta desconhecida: nao_existe" });
  });
});

// Ferramentas de leitura que o modelo usa para responder perguntas financeiras.
// Funções puras sobre o livro-razão: o modelo nunca vê o banco direto.

import type Anthropic from "@anthropic-ai/sdk";
import { entriesBetween, type LedgerEntry } from "../ledger";
import {
  accountOfMethod, accountsOf, groupOfCategory, normalizeLabel, type ExpenseGroup, type Vocab,
} from "../vocab";
import { estimateBalance, latestSnapshot, type BalanceSnapshot } from "../balance";
import { round2 } from "../dates";

export type AskData = {
  today: string;
  ledger: LedgerEntry[];
  vocab: Vocab;
  snapshots: BalanceSnapshot[];
  monthlyGoal: number;
  goals: Record<string, number>;
};

const sum = (xs: LedgerEntry[]) => round2(xs.reduce((s, e) => s + e.amount, 0));
const realized = (d: AskData) => d.ledger.filter((e) => e.status === "pago");

export function openBills(d: AskData, p: { tipo: "pagar" | "receber" | "ambos"; ate: string | null }) {
  const kinds = p.tipo === "pagar" ? ["despesa"] : p.tipo === "receber" ? ["receita"] : ["despesa", "receita"];
  const items = d.ledger
    .filter((e) => e.status === "pendente" && kinds.includes(e.kind))
    .filter((e) => !p.ate || (e.dueDate ?? e.date) <= p.ate)
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date));
  return {
    total: sum(items),
    quantidade: items.length,
    itens: items.slice(0, 40).map((e) => ({
      descricao: e.description,
      categoria: e.category,
      valor: e.amount,
      vencimento: e.dueDate ?? e.date,
      tipo: e.kind === "despesa" ? "pagar" : "receber",
      atrasado: (e.dueDate ?? e.date) < d.today,
      cliente: e.clientName,
    })),
  };
}

export function periodSummary(d: AskData, p: { de: string; ate: string }) {
  const xs = entriesBetween(realized(d), p.de, p.ate);
  const entradas = sum(xs.filter((e) => e.kind === "receita"));
  const saidas = sum(xs.filter((e) => e.kind === "despesa"));
  return { de: p.de, ate: p.ate, entradas, saidas, saldo: round2(entradas - saidas), lancamentos: xs.length };
}

export function monthResult(d: AskData, p: { mes: string }) {
  const xs = realized(d).filter((e) => e.date.startsWith(p.mes));
  const receitas = sum(xs.filter((e) => e.kind === "receita"));
  const byGroup: Record<ExpenseGroup, number> = { fixo: 0, variavel: 0, despesa: 0, investimento: 0, destinacao: 0 };
  for (const e of xs.filter((x) => x.kind === "despesa")) {
    byGroup[groupOfCategory(d.vocab, e.category) ?? "despesa"] += e.amount;
  }
  const custos = byGroup.fixo + byGroup.variavel + byGroup.despesa + byGroup.investimento;
  const resultado = round2(receitas - custos);
  return {
    mes: p.mes,
    receitas,
    custosFixos: round2(byGroup.fixo),
    custosVariaveis: round2(byGroup.variavel),
    despesas: round2(byGroup.despesa),
    investimentos: round2(byGroup.investimento),
    resultado,
    margem: receitas ? round2((resultado / receitas) * 100) : null,
    pctCustos: receitas ? round2((custos / receitas) * 100) : null,
    destinacao: round2(byGroup.destinacao),
  };
}

export function spendingByCategory(d: AskData, p: { de: string; ate: string; categoria: string | null }) {
  const filter = p.categoria ? normalizeLabel(p.categoria) : null;
  const xs = entriesBetween(realized(d), p.de, p.ate)
    .filter((e) => e.kind === "despesa")
    .filter((e) => !filter || normalizeLabel(e.category).includes(filter));
  const map = new Map<string, number>();
  for (const e of xs) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  const categorias = [...map.entries()]
    .map(([categoria, total]) => ({ categoria, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  return { total: sum(xs), categorias };
}

export function goalsProgress(d: AskData, p: { mes: string }) {
  const recebidoNoMes = monthResult(d, p).receitas;
  const acumulado = (cat: string) =>
    sum(realized(d).filter((e) => e.kind === "despesa" && normalizeLabel(e.category) === normalizeLabel(cat)));
  return {
    metaMensal: d.monthlyGoal,
    recebidoNoMes,
    percentual: d.monthlyGoal ? round2((recebidoNoMes / d.monthlyGoal) * 100) : null,
    faltam: round2(Math.max(d.monthlyGoal - recebidoNoMes, 0)),
    reservaFinanceira: { acumulado: acumulado("Reserva Financeira"), meta: d.goals.reserva_fin ?? null },
    reservaOportunidades: { acumulado: acumulado("Reserva de oportunidades"), meta: d.goals.reserva_oport ?? null },
    capitalDeGiro: { meta: d.goals.cap_giro ?? null, observacao: "realizado do capital de giro não é registrado no sistema" },
  };
}

export function balances(d: AskData, p: { conta: string | null }) {
  const accounts = accountsOf(d.vocab).filter(
    (a) => !p.conta || normalizeLabel(a).includes(normalizeLabel(p.conta)),
  );
  return accounts.map((account) => {
    const est = estimateBalance(account, latestSnapshot(d.snapshots, account), d.ledger, (m) => accountOfMethod(d.vocab, m));
    return est.balance === null
      ? { conta: account, saldoEstimado: null, motivo: "sem extrato" }
      : { conta: account, saldoEstimado: est.balance, baseExtrato: est.baseDate, lancamentosJaIncluidos: est.movementsAfter };
  });
}

export function toReview(d: AskData) {
  const xs = d.ledger.filter((e) => e.needsReview);
  return {
    quantidade: xs.length,
    itens: xs.slice(0, 30).map((e) => ({ descricao: e.description, valor: e.amount, categoria: e.category, data: e.date })),
  };
}

const dateParam = { anyOf: [{ type: "string", description: "YYYY-MM-DD" }, { type: "null" }] };

export const ASK_TOOLS: Anthropic.Tool[] = [
  {
    name: "contas_em_aberto",
    description: "Contas a pagar e/ou a receber ainda em aberto, com vencimento e se estão atrasadas. Use 'ate' = hoje para 'o que pagar hoje' (inclui atrasadas), o fim da semana para 'essa semana', ou null para todas.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["tipo", "ate"],
      properties: { tipo: { type: "string", enum: ["pagar", "receber", "ambos"] }, ate: dateParam },
    },
  },
  {
    name: "saldo_estimado",
    description: "Saldo estimado por conta (último extrato enviado + lançamentos depois). conta = null para todas.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["conta"],
      properties: { conta: { anyOf: [{ type: "string" }, { type: "null" }] } },
    },
  },
  {
    name: "resumo_periodo",
    description: "Entradas, saídas e saldo realizados entre duas datas (inclusive).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["de", "ate"],
      properties: { de: { type: "string" }, ate: { type: "string" } },
    },
  },
  {
    name: "resultado_mes",
    description: "Resultado do mês no formato da planilha: receitas, custos fixos, variáveis, despesas, investimentos, resultado, margem e % de custos. mes = YYYY-MM.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["mes"],
      properties: { mes: { type: "string" } },
    },
  },
  {
    name: "progresso_metas",
    description: "Progresso da meta de faturamento do mês e das reservas (financeira, oportunidades, capital de giro). mes = YYYY-MM.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["mes"],
      properties: { mes: { type: "string" } },
    },
  },
  {
    name: "gastos_por_categoria",
    description: "Gastos realizados por categoria num período. categoria = parte do nome para filtrar, ou null para todas.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["de", "ate", "categoria"],
      properties: { de: { type: "string" }, ate: { type: "string" }, categoria: { anyOf: [{ type: "string" }, { type: "null" }] } },
    },
  },
  {
    name: "lancamentos_a_revisar",
    description: "Lançamentos marcados para revisão (categoria incerta ou mensagem não entendida).",
    input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
];

const str = (input: unknown, key: string): string | null => {
  const v = (input as Record<string, unknown> | null)?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export function runAskTool(name: string, input: unknown, d: AskData): unknown {
  const month = d.today.slice(0, 7);
  switch (name) {
    case "contas_em_aberto": {
      const tipo = str(input, "tipo");
      return openBills(d, { tipo: tipo === "receber" || tipo === "ambos" ? tipo : "pagar", ate: str(input, "ate") });
    }
    case "saldo_estimado":
      return balances(d, { conta: str(input, "conta") });
    case "resumo_periodo":
      return periodSummary(d, { de: str(input, "de") ?? `${month}-01`, ate: str(input, "ate") ?? d.today });
    case "resultado_mes":
      return monthResult(d, { mes: str(input, "mes") ?? month });
    case "progresso_metas":
      return goalsProgress(d, { mes: str(input, "mes") ?? month });
    case "gastos_por_categoria":
      return spendingByCategory(d, {
        de: str(input, "de") ?? `${month}-01`,
        ate: str(input, "ate") ?? d.today,
        categoria: str(input, "categoria"),
      });
    case "lancamentos_a_revisar":
      return toReview(d);
    default:
      return { erro: `ferramenta desconhecida: ${name}` };
  }
}

// Agregação de lançamentos financeiros sem contagem em dobro.
//
// Cada parcela de venda vira DUAS linhas com type:"receita" — faturamento
// (bruto, na dueDate) e caixa (líquido, na cashDate) — discriminadas por
// `_flow`. Qualquer soma que filtre só por type conta a mesma parcela duas
// vezes. Um lançamento real (digitado à mão, sem `_flow`) é dinheiro E
// faturamento ao mesmo tempo, então conta nas DUAS agregações — este é o
// caso que nunca pode regredir.

export type FlowTx = {
  amount: number;
  _flow?: "faturamento" | "caixa" | null;
};

export function countsAsCaixa(t: FlowTx): boolean {
  return t._flow == null || t._flow === "caixa";
}

export function countsAsFaturamento(t: FlowTx): boolean {
  return t._flow == null || t._flow === "faturamento";
}

/** Dinheiro que entra na conta: linhas de caixa + lançamentos reais. */
export function sumCaixa(txs: FlowTx[]): number {
  return txs.filter(countsAsCaixa).reduce((s, t) => s + t.amount, 0);
}

/** Receita bruta reconhecida: linhas de faturamento + lançamentos reais. */
export function sumFaturamento(txs: FlowTx[]): number {
  return txs.filter(countsAsFaturamento).reduce((s, t) => s + t.amount, 0);
}

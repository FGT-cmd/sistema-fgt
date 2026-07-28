// Modelo de recebimentos por linha.
// Uma venda é uma lista de linhas independentes; cada linha tem sua própria
// forma de pagamento, datas e tratamento de taxa.

export type FeeOwner = "aluno" | "empresa";

export type ReceivableLine = {
  id: string;            // uso interno da UI (key do React)
  amount: string;        // valor bruto, string por ser input controlado
  paymentMethod: string;
  dueDate: string;       // YYYY-MM-DD — data combinada com o aluno
  cashDate: string;      // YYYY-MM-DD — data de entrada real no caixa
  feeOwner: FeeOwner;    // quem absorve a taxa do cartão
  feeValue: string;      // valor da taxa quando feeOwner === "empresa"
  paid: boolean;
  label: string;
};

export type ApiInstallment = {
  amount: number;
  netValue: number;
  paymentMethod: string;
  dueDate: string;
  cashDate: string;
  label: string;
  paid: boolean;
};

export type PresetId =
  | "card_full"
  | "pix_full"
  | "entry_pix_installments"
  | "entry_then_card"
  | "entry_then_pix";

export const RECEIVABLE_METHODS = [
  "Pix", "Cartão", "InfinitePay", "Dinheiro", "Transferência", "Boleto", "Outro",
] as const;

function toNumber(v: string): number {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `line_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Próximo dia útil após a data informada (pula sábado e domingo). */
export function nextBusinessDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo
  if (d.getDay() === 6) d.setDate(d.getDate() + 2); // sábado
  return d.toISOString().slice(0, 10);
}

/** Mesma data, N meses à frente. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Data padrão de entrada no caixa conforme a forma de pagamento.
 * Pix cai na hora; cartão cai em um dia útil. Sempre editável pela UI.
 */
export function defaultCashDate(dueDate: string, paymentMethod: string): string {
  return paymentMethod === "Cartão" ? nextBusinessDay(dueDate) : dueDate;
}

export function grossOf(line: ReceivableLine): number {
  return round2(toNumber(line.amount));
}

/**
 * Valor líquido da linha. Taxa do aluno => recebe o bruto.
 * Taxa da empresa => desconta a taxa informada.
 */
export function netValueOf(line: ReceivableLine): number {
  const gross = grossOf(line);
  if (line.feeOwner !== "empresa") return gross;
  const fee = toNumber(line.feeValue);
  return round2(gross - fee);
}

export function sumTotals(lines: ReceivableLine[]): { faturamento: number; caixa: number } {
  return lines.reduce(
    (acc, l) => ({
      faturamento: round2(acc.faturamento + grossOf(l)),
      caixa:       round2(acc.caixa + netValueOf(l)),
    }),
    { faturamento: 0, caixa: 0 },
  );
}

export function emptyLine(startDate: string): ReceivableLine {
  return {
    id: newId(),
    amount: "",
    paymentMethod: "Pix",
    dueDate: startDate,
    cashDate: startDate,
    feeOwner: "aluno",
    feeValue: "",
    paid: false,
    label: "",
  };
}

function makeLine(over: Partial<ReceivableLine> & { dueDate: string; paymentMethod: string }): ReceivableLine {
  return {
    id: newId(),
    amount: "",
    feeOwner: "aluno",
    feeValue: "",
    paid: false,
    label: "",
    cashDate: defaultCashDate(over.dueDate, over.paymentMethod),
    ...over,
  };
}

/**
 * Monta as linhas de um formato de negociação já praticado pela FGT.
 * É ponto de partida: todas as linhas continuam editáveis depois.
 */
export function buildPreset(
  preset: PresetId,
  opts: { total: number; startDate: string; entryAmount?: number; parcelas?: number },
): ReceivableLine[] {
  const { total, startDate } = opts;
  const entry = opts.entryAmount ?? 0;

  if (preset === "card_full") {
    return [makeLine({ dueDate: startDate, paymentMethod: "Cartão",
                       amount: String(round2(total)), label: "Pagamento" })];
  }

  if (preset === "pix_full") {
    return [makeLine({ dueDate: startDate, paymentMethod: "Pix",
                       amount: String(round2(total)), label: "Pagamento" })];
  }

  if (preset === "entry_then_card" || preset === "entry_then_pix") {
    const method = preset === "entry_then_card" ? "Cartão" : "Pix";
    return [
      makeLine({ dueDate: startDate, paymentMethod: "Pix",
                 amount: String(round2(entry)), label: "Entrada" }),
      makeLine({ dueDate: addMonths(startDate, 1), paymentMethod: method,
                 amount: String(round2(total - entry)), label: "Restante" }),
    ];
  }

  // entry_pix_installments
  const parcelas = opts.parcelas ?? 2;
  const restante = round2(total - entry);
  const base = round2(restante / parcelas);
  const lines: ReceivableLine[] = [
    makeLine({ dueDate: startDate, paymentMethod: "Pix",
               amount: String(round2(entry)), label: "Entrada" }),
  ];
  for (let i = 0; i < parcelas; i++) {
    // A sobra de centavos vai na primeira parcela para o total fechar.
    const valor = i === 0 ? round2(restante - base * (parcelas - 1)) : base;
    lines.push(makeLine({
      dueDate: addMonths(startDate, i + 1),
      paymentMethod: "Pix",
      amount: String(valor),
      label: `${i + 1}ª parcela`,
    }));
  }
  return lines;
}

/** Converte as linhas da UI no payload aceito por POST /api/financeiro/vendas. */
export function toApiInstallments(lines: ReceivableLine[]): ApiInstallment[] {
  return lines
    .filter(l => grossOf(l) > 0)
    .map(l => ({
      amount:        grossOf(l),
      netValue:      netValueOf(l),
      paymentMethod: l.paymentMethod,
      dueDate:       l.dueDate,
      cashDate:      l.cashDate,
      label:         l.label,
      paid:          l.paid,
    }));
}

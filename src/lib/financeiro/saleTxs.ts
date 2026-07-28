// Converte vendas em lançamentos exibidos no financeiro.
// Extraído de app/(dashboard)/financeiro/page.tsx sem alteração de comportamento.

export type InstallmentInput = {
  id: string;
  number: number;
  amount: number;
  netValue: number | null;
  dueDate: string | null;
  cashDate: string | null;
  paidAt: string | null;
  status: string;
  label: string | null;
  paymentMethod: string | null;
};

export type SaleInput = {
  id: string;
  description: string;
  negotiationType: string | null;
  grossValue: number | null;
  paymentMethod: string | null;
  installmentsCount: number;
  createdAt: string | null;
  client: { id: string; name: string };
  installments: InstallmentInput[];
};

export type SaleTx = {
  id: string;
  type: "receita";
  description: string;
  amount: number;
  category: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: null;
  client: { id: string; name: string };
  _saleId: string;
  _installmentId?: string;
};

export function buildSaleTxs(
  sales: SaleInput[],
  existingInstallmentIds: Set<string>,
): SaleTx[] {
  return sales.flatMap(sale => {
    const isCard = sale.negotiationType === "card";
    const txList: SaleTx[] = [];

    if (isCard && sale.grossValue && !existingInstallmentIds.has(`rev_${sale.id}`)) {
      txList.push({
        id: `rev_${sale.id}`, type: "receita",
        description: `${sale.description} (faturamento)`,
        amount: sale.grossValue, category: "Faturamento", status: "pago",
        dueDate: sale.createdAt ?? null, paidAt: sale.createdAt ?? null,
        paymentMethod: sale.paymentMethod ?? null, notes: null,
        client: sale.client, _saleId: sale.id,
      });
    }

    const instTxs = sale.installments
      .filter(inst => !existingInstallmentIds.has(inst.id))
      .map(inst => {
        const cashAmt = isCard && inst.netValue ? inst.netValue : inst.amount;
        const suffix = inst.label
          ? ` — ${inst.label}`
          : sale.installmentsCount > 1
            ? ` (${inst.number}/${sale.installmentsCount})`
            : "";
        return {
          id: `inst_${inst.id}`, type: "receita" as const,
          description: isCard
            ? `${sale.description}${suffix} (caixa)`
            : `${sale.description}${suffix}`,
          amount: cashAmt,
          category: isCard
            ? "Caixa"
            : sale.installmentsCount === 1 ? "Consultoria anual" : "Parcela",
          status: inst.status, dueDate: inst.dueDate ?? null, paidAt: inst.paidAt ?? null,
          paymentMethod: sale.paymentMethod ?? null, notes: null,
          client: sale.client, _saleId: sale.id, _installmentId: inst.id,
        };
      });

    return [...txList, ...instTxs];
  });
}

// Converte vendas em lançamentos exibidos no financeiro.
// Cada parcela gera dois lançamentos: faturamento (bruto, na dueDate) e
// caixa (líquido, na cashDate), com a forma de pagamento vinda da linha.

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
  return sales.flatMap(sale =>
    sale.installments
      .filter(inst => !existingInstallmentIds.has(inst.id))
      .flatMap(inst => {
        const suffix = inst.label
          ? ` — ${inst.label}`
          : sale.installmentsCount > 1
            ? ` (${inst.number}/${sale.installmentsCount})`
            : "";
        const metodo   = inst.paymentMethod ?? sale.paymentMethod ?? null;
        const liquido  = inst.netValue ?? inst.amount;
        const dataCaixa = inst.cashDate ?? inst.dueDate ?? null;
        const base = {
          type: "receita" as const,
          status: inst.status,
          paidAt: inst.paidAt ?? null,
          paymentMethod: metodo,
          notes: null,
          client: sale.client,
          _saleId: sale.id,
          _installmentId: inst.id,
        };

        return [
          {
            ...base,
            id: `fat_${inst.id}`,
            description: `${sale.description}${suffix} (faturamento)`,
            amount: inst.amount,
            category: "Faturamento",
            dueDate: inst.dueDate ?? null,
          },
          {
            ...base,
            id: `inst_${inst.id}`,
            description: `${sale.description}${suffix}`,
            amount: liquido,
            category: "Caixa",
            dueDate: dataCaixa,
          },
        ];
      }),
  );
}

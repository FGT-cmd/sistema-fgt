// Converte as linhas de recebimento recebidas pela API (customInstallments)
// nos dados de criação de Installment. Puro e testável — a rota só persiste.

export type CustomInstallmentInput = {
  amount: string | number;
  dueDate: string;
  cashDate?: string | null;
  netValue?: string | number | null;
  label?: string | null;
  paid?: boolean;
  paymentMethod?: string | null;
};

export type InstallmentCreateData = {
  number: number;
  amount: number;
  netValue?: number;
  dueDate: Date;
  cashDate?: Date;
  status: string;
  paidAt?: Date;
  label?: string;
  paymentMethod?: string;
};

export function buildInstallmentCreateData(
  list: CustomInstallmentInput[],
  opts: { markAllPaid?: boolean; now?: Date } = {},
): InstallmentCreateData[] {
  const now = opts.now ?? new Date();

  return list.map((inst, i) => {
    const paid = opts.markAllPaid === true || inst.paid === true;
    const entry: InstallmentCreateData = {
      number:  i + 1,
      amount:  parseFloat(String(inst.amount)),
      dueDate: new Date(String(inst.dueDate) + "T12:00"),
      status:  paid ? "pago" : "pendente",
      label:   inst.label || undefined,
    };

    if (inst.cashDate) entry.cashDate = new Date(String(inst.cashDate) + "T12:00");

    // Checagem explícita: netValue 0 é legítimo (linha inteiramente
    // consumida pela taxa). Um teste de verdade (`if (inst.netValue)`)
    // descartaria o zero, deixaria a coluna nula e faria o caixa reportar
    // o bruto — dinheiro que nunca entrou.
    if (inst.netValue !== undefined && inst.netValue !== null) {
      entry.netValue = parseFloat(String(inst.netValue));
    }

    if (inst.paymentMethod) entry.paymentMethod = inst.paymentMethod;
    if (paid)               entry.paidAt        = now;

    return entry;
  });
}

import { prisma } from "@/lib/prisma";
import { buildSaleTxs, type SaleInput } from "./saleTxs";
import { buildLedger, type LedgerEntry } from "./ledger";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadLedger(userId: string): Promise<LedgerEntry[]> {
  const [txs, sales] = await Promise.all([
    prisma.financialTx.findMany({ include: { client: { select: { name: true } } } }),
    prisma.sale.findMany({
      where: { client: { userId } },
      include: {
        client: { select: { id: true, name: true } },
        installments: { orderBy: { number: "asc" } },
      },
    }),
  ]);

  const saleInputs: SaleInput[] = sales.map((s) => ({
    id: s.id,
    description: s.description,
    negotiationType: s.negotiationType,
    grossValue: s.grossValue,
    paymentMethod: s.paymentMethod,
    installmentsCount: s.installmentsCount,
    createdAt: iso(s.createdAt),
    client: s.client,
    installments: s.installments.map((i) => ({
      id: i.id,
      number: i.number,
      amount: i.amount,
      netValue: i.netValue,
      dueDate: iso(i.dueDate),
      cashDate: iso(i.cashDate),
      paidAt: iso(i.paidAt),
      status: i.status,
      label: i.label,
      paymentMethod: i.paymentMethod,
    })),
  }));

  // Parcela que já tem FinancialTx próprio não gera linha derivada (regra do buildSaleTxs).
  const linked = new Set(txs.map((t) => t.installmentId).filter((x): x is string => !!x));
  return buildLedger(txs, buildSaleTxs(saleInputs, linked));
}

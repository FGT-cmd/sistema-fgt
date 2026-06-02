import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; parcelaId: string }> }
) {
  const { parcelaId } = await params;
  const body = await req.json();

  const instData: Record<string, unknown> = {};
  const txData: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const paidAt = body.status === "pago" ? new Date() : null;
    instData.status = body.status;
    instData.paidAt = paidAt;
    txData.status   = body.status;
    txData.paidAt   = paidAt;
  }
  if (body.dueDate !== undefined) {
    const d = new Date(body.dueDate + "T12:00");
    instData.dueDate = d;
    txData.dueDate   = d;
  }
  if (body.amount !== undefined) {
    const a = parseFloat(body.amount);
    instData.amount = a;
    txData.amount   = a;
  }
  const newAmount = body.amount !== undefined ? parseFloat(body.amount) : undefined;
  if (body.notes !== undefined) {
    instData.notes = body.notes ?? undefined;
  }
  if (body.paymentMethod !== undefined) {
    instData.paymentMethod = body.paymentMethod ?? null;
  }

  const installment = await prisma.installment.update({
    where: { id: parcelaId },
    data: instData,
  });

  // Sincroniza a FinancialTx vinculada via FK
  if (Object.keys(txData).length > 0) {
    await prisma.financialTx.updateMany({
      where: { installmentId: parcelaId },
      data: txData,
    });
  }

  // Sincroniza InvoiceIssue.amount quando o valor da parcela muda (exceto notas já emitidas)
  if (newAmount !== undefined) {
    await prisma.invoiceIssue.updateMany({
      where: { saleId: installment.saleId, status: { notIn: ["issued", "cancelled"] } },
      data: { amount: newAmount },
    });
  }

  return NextResponse.json(installment);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; parcelaId: string }> }
) {
  const { parcelaId } = await params;
  const body = await req.json();

  const current = await prisma.installment.findUnique({ where: { id: parcelaId } });
  if (!current) {
    return NextResponse.json({ error: "Parcela não encontrada" }, { status: 404 });
  }

  const instData: Record<string, unknown> = {};
  const txData: Record<string, unknown> = {};

  if (body.status !== undefined) {
    instData.status = body.status;
    txData.status   = body.status;

    // paidAt só muda quando o status REALMENTE transiciona. Um "Salvar"
    // sem alterações reenvia o mesmo status; reescrever paidAt aqui
    // apagaria a data em que o dinheiro entrou de fato.
    const wasPaid = current.status === "pago";
    const isPaid  = body.status === "pago";
    if (isPaid && !wasPaid) {
      instData.paidAt = new Date();
      txData.paidAt   = instData.paidAt;
    } else if (!isPaid && wasPaid) {
      instData.paidAt = null;
      txData.paidAt   = null;
    }
  }
  if (body.dueDate !== undefined) {
    const d = new Date(body.dueDate + "T12:00");
    instData.dueDate = d;
    txData.dueDate   = d;
  }

  const newAmount = body.amount !== undefined ? parseFloat(body.amount) : undefined;
  if (newAmount !== undefined && !Number.isNaN(newAmount)) {
    instData.amount = newAmount;
    txData.amount   = newAmount;

    // O líquido (netValue) alimenta o Caixa e o bruto (amount) alimenta o
    // Faturamento. Corrigir só o bruto deixaria o líquido velho, e o mês
    // reportaria caixa a menos sem nada na tela. Regras aplicadas:
    //
    //  a) netValue nulo (vendas antigas) → continua nulo; o Caixa já cai
    //     no bruto por fallback, então bruto e líquido seguem iguais.
    //  b) líquido igual ao bruto (linha sem taxa) → acompanha o novo bruto,
    //     preservando a igualdade.
    //  c) linha com taxa → reescala proporcionalmente, preservando a razão
    //     líquido/bruto original (a taxa acompanha o valor corrigido).
    //  d) bruto original zero/inválido → não há razão a preservar; assume
    //     linha sem taxa e iguala ao novo bruto.
    if (current.netValue !== null && current.netValue !== undefined) {
      if (current.netValue === current.amount || !(current.amount > 0)) {
        instData.netValue = newAmount;               // regras (b) e (d)
      } else {
        const feeRatio = current.netValue / current.amount;
        instData.netValue = round2(newAmount * feeRatio); // regra (c)
      }
    }
  }
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
  if (newAmount !== undefined && !Number.isNaN(newAmount)) {
    await prisma.invoiceIssue.updateMany({
      where: { saleId: installment.saleId, status: { notIn: ["issued", "cancelled"] } },
      data: { amount: newAmount },
    });
  }

  return NextResponse.json(installment);
}

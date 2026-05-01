import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const paidAt = body.status === "pago" ? new Date() : null;

  const tx = await prisma.financialTx.update({
    where: { id },
    data: {
      ...(body.description  !== undefined && { description: body.description }),
      ...(body.amount       !== undefined && { amount: Number(body.amount) }),
      ...(body.category     !== undefined && { category: body.category }),
      ...(body.status       !== undefined && { status: body.status, paidAt }),
      ...(body.dueDate      !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.paymentMethod !== undefined && { paymentMethod: body.paymentMethod || null }),
      ...(body.notes        !== undefined && { notes: body.notes || null }),
      ...(body.clientId     !== undefined && body.clientId
        ? { client: { connect: { id: body.clientId } } }
        : body.clientId === null ? { client: { disconnect: true } } : {}
      ),
    },
    include: { client: { select: { id: true, name: true } } },
  });

  // Se vinculada a uma parcela, sincroniza via FK
  if (body.status !== undefined && tx.installmentId) {
    await prisma.installment.update({
      where: { id: tx.installmentId },
      data: { status: body.status, paidAt },
    });
  }

  return NextResponse.json(tx);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tx = await prisma.financialTx.findUnique({ where: { id }, select: { installmentId: true } });

  // Bloqueia deleção de lançamentos vinculados a parcelas de alunos
  if (tx?.installmentId) {
    return NextResponse.json(
      { error: "Este lançamento está vinculado a uma parcela de aluno. Para removê-lo, exclua a venda pela ficha do aluno ou pelo Financeiro > Parcelas a Receber." },
      { status: 400 }
    );
  }

  await prisma.financialTx.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

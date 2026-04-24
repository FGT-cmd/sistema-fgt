import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const tx = await prisma.financialTx.update({
    where: { id },
    data: {
      ...(body.description !== undefined && { description: body.description }),
      ...(body.amount !== undefined && { amount: Number(body.amount) }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.status !== undefined && {
        status: body.status,
        paidAt: body.status === "pago" ? new Date() : null,
      }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.paymentMethod !== undefined && { paymentMethod: body.paymentMethod || null }),
      ...(body.notes !== undefined && { notes: body.notes || null }),
      ...(body.clientId !== undefined && { clientId: body.clientId || null }),
    },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(tx);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.financialTx.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

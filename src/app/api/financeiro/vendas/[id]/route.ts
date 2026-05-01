import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Cascade: Installments são deletados pelo DB (onDelete: Cascade na Sale)
  // FinancialTx são deletados pelo DB (onDelete: Cascade no installmentId FK)
  await prisma.sale.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

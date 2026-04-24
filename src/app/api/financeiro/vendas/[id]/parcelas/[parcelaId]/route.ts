import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; parcelaId: string }> }
) {
  const { parcelaId } = await params;
  const body = await req.json();

  const installment = await prisma.installment.update({
    where: { id: parcelaId },
    data: {
      status: body.status,
      paidAt: body.status === "pago" ? new Date() : null,
      notes: body.notes ?? undefined,
    },
  });

  return NextResponse.json(installment);
}

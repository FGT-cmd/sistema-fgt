import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const where = clientId
    ? { client: { userId: (await getDefaultUser()).id }, clientId }
    : { client: { userId: (await getDefaultUser()).id } };

  const sales = await prisma.sale.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      installments: { orderBy: { number: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description, totalAmount, installmentsCount, negotiationNotes, paymentMethod, clientId, firstDueDate, customInstallments } = body;

  if (!description || !totalAmount || !clientId) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const amount = parseFloat(totalAmount);

  let installmentData: { number: number; amount: number; dueDate: Date; status: "pendente" }[];

  if (customInstallments && Array.isArray(customInstallments) && customInstallments.length > 0) {
    // Parcelas personalizadas — cada uma com valor e data próprios
    installmentData = customInstallments.map((inst: { amount: string | number; dueDate: string }, i: number) => ({
      number: i + 1,
      amount: parseFloat(String(inst.amount)),
      dueDate: new Date(inst.dueDate + "T12:00"),
      status: "pendente" as const,
    }));
  } else {
    // Divisão igual
    const count = Math.max(1, parseInt(installmentsCount) || 1);
    const perParcela = parseFloat((amount / count).toFixed(2));
    const baseDate = firstDueDate ? new Date(firstDueDate + "T12:00") : new Date();
    installmentData = Array.from({ length: count }, (_, i) => {
      const due = new Date(baseDate);
      due.setMonth(due.getMonth() + i);
      return { number: i + 1, amount: perParcela, dueDate: due, status: "pendente" as const };
    });
  }

  const sale = await prisma.sale.create({
    data: {
      description,
      totalAmount:       amount,
      installmentsCount: installmentData.length,
      negotiationNotes:  negotiationNotes || null,
      paymentMethod:     paymentMethod || null,
      clientId,
      installments: { create: installmentData },
    },
    include: {
      client: { select: { id: true, name: true } },
      installments: { orderBy: { number: "asc" } },
    },
  });

  return NextResponse.json(sale);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import {
  buildInstallmentCreateData,
  type CustomInstallmentInput,
} from "@/lib/financeiro/saleInstallments";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const where = clientId
      ? { client: { userId: (await getDefaultUser()).id }, clientId }
      : { client: { userId: (await getDefaultUser()).id } };

    const sales = await prisma.sale.findMany({
      where,
      include: {
        client:      { select: { id: true, name: true } },
        servicePlan: { select: { id: true, name: true } },
        installments: { orderBy: { number: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sales);
  } catch (err) {
    console.error("[GET /api/financeiro/vendas]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      description, totalAmount, negotiationNotes, paymentMethod,
      clientId, customInstallments, markAllPaid,
      // Novos campos
      negotiationType, servicePlanId, grossValue, netValue, cashFlowDate,
    } = body;

    if (!description || !totalAmount || !clientId) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const amount  = parseFloat(String(totalAmount));
    const isPaid  = markAllPaid === true;

    // Monta installments a partir dos dados customizados (sempre livres agora)
    const installmentData = Array.isArray(customInstallments) && customInstallments.length > 0
      ? buildInstallmentCreateData(customInstallments as CustomInstallmentInput[], { markAllPaid: isPaid })
      : [];

    const sale = await prisma.sale.create({
      data: {
        description,
        totalAmount:       amount,
        installmentsCount: installmentData.length,
        negotiationNotes:  negotiationNotes  || null,
        paymentMethod:     paymentMethod     || null,
        negotiationType:   negotiationType   || null,
        servicePlanId:     servicePlanId     || null,
        grossValue:        grossValue        ? parseFloat(String(grossValue))       : null,
        netValue:          netValue          ? parseFloat(String(netValue))         : null,
        cashFlowDate:      cashFlowDate      ? new Date(String(cashFlowDate) + "T12:00") : null,
        clientId,
        installments:      installmentData.length > 0 ? { create: installmentData } : undefined,
      },
      include: {
        client:       { select: { id: true, name: true } },
        servicePlan:  { select: { id: true, name: true } },
        installments: { orderBy: { number: "asc" } },
      },
    });

    return NextResponse.json(sale);
  } catch (err) {
    console.error("[POST /api/financeiro/vendas]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

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
    const paidAt  = isPaid ? new Date() : undefined;
    const status  = isPaid ? "pago" : "pendente";

    // Monta installments a partir dos dados customizados (sempre livres agora)
    type InstData = {
      number: number; amount: number; netValue?: number;
      dueDate: Date; status: string; paidAt?: Date; label?: string;
    };
    let installmentData: InstData[] = [];

    if (Array.isArray(customInstallments) && customInstallments.length > 0) {
      installmentData = customInstallments.map((inst: {
        amount: string | number; dueDate: string;
        netValue?: string | number; label?: string; paid?: boolean; paymentMethod?: string;
      }, i: number) => {
        const instPaid = isPaid || inst.paid === true;
        const entry: InstData = {
          number:  i + 1,
          amount:  parseFloat(String(inst.amount)),
          dueDate: new Date(String(inst.dueDate) + "T12:00"),
          status:  instPaid ? "pago" : "pendente",
          label:   inst.label || undefined,
        };
        if (inst.netValue) entry.netValue = parseFloat(String(inst.netValue));
        if (inst.paymentMethod) (entry as Record<string, unknown>).paymentMethod = inst.paymentMethod;
        if (instPaid) entry.paidAt = new Date();
        return entry;
      });
    }

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

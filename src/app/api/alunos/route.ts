import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const clients = await prisma.client.findMany({
      where: { userId: user.id },
      include: {
        checkIns:    { orderBy: { createdAt: "desc" }, take: 1 },
        sales:       { include: { installments: { where: { status: "pendente" } } } },
        anamnese:    true,
        workoutPlans: { where: { active: true }, take: 1 },
        bodyRecords: { orderBy: { date: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clients);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();

    const client = await prisma.client.create({
      data: {
        name:   body.name,
        email:  body.email  || null,
        phone:  body.phone  || null,
        notes:  body.notes  || null,
        status: "ativo",
        userId: user.id,
      },
    });

    // Se informações de pagamento foram fornecidas, cria Sale + Installments
    if (body.payment?.totalAmount && body.payment.totalAmount > 0) {
      const { totalAmount, installments = 1, description, paymentMethod, firstDueDate } = body.payment;
      const amountPerInstallment = totalAmount / installments;
      const startDate = firstDueDate ? new Date(firstDueDate) : new Date();

      const sale = await prisma.sale.create({
        data: {
          clientId:         client.id,
          description:      description || "Plano de consultoria",
          totalAmount,
          installmentsCount: installments,
          paymentMethod:    paymentMethod || null,
          status:           "ativo",
        },
      });

      const installmentData = Array.from({ length: installments }, (_, i) => {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        return {
          saleId:  sale.id,
          number:  i + 1,
          amount:  amountPerInstallment,
          dueDate,
          status:  "pendente" as const,
        };
      });

      await prisma.installment.createMany({ data: installmentData });
    }

    const clientWithSales = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        sales: { include: { installments: true } },
      },
    });

    return NextResponse.json(clientWithSales);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "YYYY-MM"

  let where = {};
  if (month) {
    const [year, m] = month.split("-").map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 1);
    where = {
      OR: [
        { dueDate: { gte: start, lt: end } },
        { paidAt: { gte: start, lt: end } },
        { createdAt: { gte: start, lt: end } },
      ],
    };
  }

  const txs = await prisma.financialTx.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json(txs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const tx = await prisma.financialTx.create({
    data: {
      type: body.type,
      description: body.description,
      amount: Number(body.amount),
      category: body.category,
      status: body.status || "pendente",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      paidAt: body.status === "pago" && body.paidAt ? new Date(body.paidAt) : null,
      paymentMethod: body.paymentMethod || null,
      notes: body.notes || null,
      clientId: body.clientId || null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(tx);
}

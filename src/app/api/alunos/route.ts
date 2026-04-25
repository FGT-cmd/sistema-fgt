import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const clients = await prisma.client.findMany({
      where: { userId: user.id },
      include: {
        sales: { include: { installments: true } },
        financialTxs: { where: { type: "receita" }, orderBy: { createdAt: "desc" }, take: 5 },
        files: { where: { category: "contrato" }, take: 1 },
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
        name:             body.name,
        email:            body.email            || null,
        phone:            body.phone            || null,
        notes:            body.notes            || null,
        status:           body.status           || "ativo",
        source:           body.source           || null,
        planName:         body.planName         || null,
        paymentMethod:    body.paymentMethod    || null,
        negotiationNotes: body.negotiationNotes || null,
        userId:           user.id,
      },
      include: {
        sales: { include: { installments: true } },
        financialTxs: true,
        files: true,
      },
    });

    return NextResponse.json(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

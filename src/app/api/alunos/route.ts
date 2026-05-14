import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const clients = await prisma.client.findMany({
      where: { userId: user.id },
      include: {
        sales: { include: { installments: true }, orderBy: { createdAt: "desc" } },
        financialTxs: { where: { type: "receita" }, orderBy: { createdAt: "desc" } },
        files: { orderBy: { createdAt: "desc" } },
        invoiceIssues: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clients);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
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
        planDetails:      body.planDetails      || null,
        paymentMethod:    body.paymentMethod    || null,
        negotiationNotes: body.negotiationNotes || null,
        userId:           user.id,
      },
    });

    const result = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        sales: { include: { installments: true } },
        financialTxs: true,
        files: true,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  // Importação em massa
  try {
    const user = await getDefaultUser();
    const { alunos } = await req.json();
    const created = [];

    for (const a of alunos) {
      const client = await prisma.client.create({
        data: {
          name:          a.name,
          email:         a.email   || null,
          phone:         a.phone   || null,
          notes:         a.notes   || null,
          status:        a.status  || "ativo",
          source:        a.source  || null,
          planName:      a.planName || null,
          paymentMethod: a.paymentMethod || null,
          userId:        user.id,
        },
      });
      created.push(client);
    }

    return NextResponse.json({ ok: true, count: created.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

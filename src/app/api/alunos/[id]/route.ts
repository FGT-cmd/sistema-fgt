import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        sales: { include: { installments: true } },
        financialTxs: { orderBy: { createdAt: "desc" } },
        files: { orderBy: { createdAt: "desc" } },
        invoiceIssues: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const client = await prisma.client.update({
      where: { id },
      data: {
        name:             body.name,
        email:            body.email            || null,
        phone:            body.phone            || null,
        cpf:              body.cpf              || null,
        notes:            body.notes            || null,
        status:           body.status,
        source:           body.source           || null,
        planName:         body.planName         || null,
        planDetails:      body.planDetails      || null,
        paymentMethod:    body.paymentMethod    || null,
        negotiationNotes: body.negotiationNotes || null,
        contractUrl:      body.contractUrl      || null,
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // onDelete: Cascade no schema garante que Sales → Installments → FinancialTx são deletados
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

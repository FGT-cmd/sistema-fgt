import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        checkIns: { orderBy: { createdAt: "desc" } },
        sales: { include: { installments: true } },
        anamnese: true,
        workoutPlans: { include: { workoutDays: { include: { workoutItems: { include: { exercise: true } } } } } },
        bodyRecords: { orderBy: { date: "desc" } },
        files: { orderBy: { createdAt: "desc" } },
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
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        notes: body.notes || null,
        status: body.status,
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
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

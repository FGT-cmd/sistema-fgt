import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

const DEFAULTS: Record<string, string[]> = {
  income_cat:   ["Consultoria anual","Consultoria semestral","Consultoria trimestral","Aulas presenciais","Caixa","Faturamento","Parcela","Outros"],
  expense_cat:  ["Custos fixos","Custos variáveis","Despesas","Investimentos","Pró-labore","Reservas"],
  recv_method:  ["Pix","Cartão","InfinitePay","Dinheiro","Plataforma","Outro"],
  pay_method:   ["Pix PJ","Cartão PJ","Cartão PF","Dinheiro","Outro"],
};

export async function GET(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const where = type
      ? { userId: user.id, type, active: true }
      : { userId: user.id, active: true };

    let data = await prisma.financialConfig.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    // Seed defaults on first use for category/method types
    const typesToCheck = type ? [type] : Object.keys(DEFAULTS);
    for (const t of typesToCheck) {
      if (!(t in DEFAULTS)) continue;
      const hasAny = data.some(d => d.type === t);
      if (!hasAny) {
        await prisma.financialConfig.createMany({
          data: DEFAULTS[t].map((v, i) => ({ userId: user.id, type: t, value: v, order: i })),
        });
      }
    }

    // Re-fetch if seeded
    const seeded = typesToCheck.some(t => t in DEFAULTS && !data.some(d => d.type === t));
    if (seeded) {
      data = await prisma.financialConfig.findMany({
        where,
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/financeiro/config]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();

    // Upsert for goals (by key)
    if (body.type === "goal" && body.key) {
      const existing = await prisma.financialConfig.findFirst({
        where: { userId: user.id, type: "goal", key: body.key },
      });
      if (existing) {
        const updated = await prisma.financialConfig.update({
          where: { id: existing.id },
          data: { value: String(body.value ?? "0") },
        });
        return NextResponse.json(updated);
      }
    }

    const data = await prisma.financialConfig.create({
      data: {
        userId: user.id,
        type: body.type,
        value: String(body.value ?? ""),
        key: body.key ?? null,
        order: body.order ?? 0,
      },
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/financeiro/config]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

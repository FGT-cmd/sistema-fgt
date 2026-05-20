import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");

    if (month) {
      const data = await prisma.financialMonthClose.findUnique({
        where: { userId_month: { userId: user.id, month } },
      });
      return NextResponse.json(data || null);
    }

    const data = await prisma.financialMonthClose.findMany({
      where: { userId: user.id },
      orderBy: { month: "asc" },
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/financeiro/fechamento]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();
    const { month, ...rest } = body;

    if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

    const cleanRest: Record<string, unknown> = {};
    const allowed = ["saldoInicial","saldoBanco","notes","receitasProj","custosFixos","custosVar","despesas","investimentos","prolabore","reservas","distLucros"];
    for (const k of allowed) {
      if (rest[k] !== undefined) {
        cleanRest[k] = rest[k] === "" ? null : rest[k];
      }
    }

    const data = await prisma.financialMonthClose.upsert({
      where: { userId_month: { userId: user.id, month } },
      create: { userId: user.id, month, ...cleanRest },
      update: cleanRest,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/financeiro/fechamento]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

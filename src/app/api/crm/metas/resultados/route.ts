import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));

    const user = await getDefaultUser();

    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    // Faturamento real (receitas pagas no mês)
    const txs = await prisma.financialTx.findMany({
      where: {
        client: { userId: user.id },
        type: "receita",
        status: "pago",
        paidAt: { gte: start, lt: end },
      },
    });
    const revenue = txs.reduce((s, t) => s + t.amount, 0);

    // Leads criados no mês
    const allDeals = await prisma.deal.findMany({
      where: {
        userId: user.id,
        firstContact: { gte: start, lt: end },
      },
      select: { stage: true },
    });
    const leadsCount = allDeals.length;

    // Conversão = deals que avançaram além de "lead" / total leads do mês
    const converted = allDeals.filter((d) => d.stage !== "lead").length;
    const conversionRate = leadsCount > 0 ? (converted / leadsCount) * 100 : 0;

    // Novos clientes (não lead) criados no mês
    const newClients = await prisma.client.count({
      where: {
        userId: user.id,
        status: { not: "lead" },
        createdAt: { gte: start, lt: end },
      },
    });

    return NextResponse.json({ revenue, leadsCount, conversionRate, newClients });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

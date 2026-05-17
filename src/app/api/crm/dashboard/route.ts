import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));

    const user = await getDefaultUser();

    const [goal, allDeals] = await Promise.all([
      prisma.monthlyGoal.findUnique({
        where: { userId_month_year: { userId: user.id, month, year } },
      }),
      prisma.deal.findMany({
        where: { userId: user.id },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const revenueGoal           = goal?.revenueGoal           ?? 0;
    const averageTicketGoal     = goal?.averageTicketGoal     ?? 0;
    const closingRateGoal       = goal?.closingRateGoal       ?? 0;
    const qualificationRateGoal = goal?.qualificationRateGoal ?? 0;

    // Realized: deals fechados atualizados neste mês
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 0, 23, 59, 59, 999);
    const closedThisMonth = allDeals.filter(
      (d) => d.stage === "fechado" && d.updatedAt >= startOfMonth && d.updatedAt <= endOfMonth
    );
    const realized = closedThisMonth.reduce((s, d) => s + (d.closedValue ?? d.value ?? 0), 0);
    const gap = revenueGoal - realized;

    // Projeção linear para o mês corrente
    const today           = new Date();
    const isCurrentMonth  = today.getMonth() + 1 === month && today.getFullYear() === year;
    const daysElapsed     = isCurrentMonth ? today.getDate() : new Date(year, month, 0).getDate();
    const daysInMonth     = new Date(year, month, 0).getDate();
    const projection      = daysElapsed > 0 ? (realized / daysElapsed) * daysInMonth : 0;

    // Desdobramento
    const closingsNeeded       = averageTicketGoal > 0 ? Math.ceil(revenueGoal / averageTicketGoal) : 0;
    const opportunitiesNeeded  = closingRateGoal > 0   ? Math.ceil(closingsNeeded / (closingRateGoal / 100)) : 0;
    const leadsNeeded          = qualificationRateGoal > 0 ? Math.ceil(opportunitiesNeeded / (qualificationRateGoal / 100)) : 0;

    // Funil por etapa
    const stageOrder = ["novo_lead", "contatado", "qualificado", "proposta_enviada", "call_agendada", "call_feita", "fechado", "perdido"];
    const funnel = stageOrder.map((stage) => ({
      stage,
      count: allDeals.filter((d) => d.stage === stage).length,
    }));

    // Conversões entre etapas (taxa snapshot — conta atual em cada etapa)
    const activeStages = ["novo_lead", "contatado", "qualificado", "proposta_enviada", "call_agendada", "call_feita", "fechado"];
    const conversions = activeStages.slice(0, -1).map((stage, i) => {
      const fromCount = allDeals.filter((d) => d.stage === stage).length;
      const toCount   = allDeals.filter((d) => d.stage === activeStages[i + 1]).length;
      const rate      = fromCount > 0 ? Math.min((toCount / fromCount) * 100, 100) : 0;
      return { from: stage, to: activeStages[i + 1], rate };
    });
    const totalDeals       = allDeals.length;
    const totalClosed      = allDeals.filter((d) => d.stage === "fechado").length;
    const overallConversion = totalDeals > 0 ? (totalClosed / totalDeals) * 100 : 0;

    // Por origem
    const sourceMap = new Map<string, { leads: number; closings: number; revenue: number }>();
    for (const deal of allDeals) {
      const src = deal.source || "Não informado";
      if (!sourceMap.has(src)) sourceMap.set(src, { leads: 0, closings: 0, revenue: 0 });
      const entry = sourceMap.get(src)!;
      entry.leads++;
      if (deal.stage === "fechado") {
        entry.closings++;
        entry.revenue += deal.closedValue ?? deal.value ?? 0;
      }
    }
    const bySource = Array.from(sourceMap.entries())
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.leads - a.leads);

    // Gargalos
    const threeDaysAgo     = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const activeNonClosed  = allDeals.filter((d) => !["fechado", "perdido"].includes(d.stage));

    const withoutNextAction = activeNonClosed
      .filter((d) => !d.nextAction)
      .map((d) => ({ id: d.id, title: d.title, stage: d.stage, clientName: d.client.name }));

    const proposalsWithoutFollowUp = allDeals
      .filter((d) => d.stage === "proposta_enviada" && d.updatedAt < threeDaysAgo)
      .map((d) => ({ id: d.id, title: d.title, clientName: d.client.name, updatedAt: d.updatedAt.toISOString() }));

    const callsWithoutReturn = allDeals
      .filter((d) => d.stage === "call_feita" && d.updatedAt < threeDaysAgo)
      .map((d) => ({ id: d.id, title: d.title, clientName: d.client.name, updatedAt: d.updatedAt.toISOString() }));

    const lostDeals      = allDeals.filter((d) => d.stage === "perdido");
    const objectionMap   = new Map<string, number>();
    for (const deal of lostDeals) {
      const obj =
        deal.objection ||
        deal.notes?.match(/\[PERDA: (.+?)\]/)?.[1] ||
        "Não informado";
      objectionMap.set(obj, (objectionMap.get(obj) ?? 0) + 1);
    }
    const lostByObjection = Array.from(objectionMap.entries())
      .map(([objection, count]) => ({ objection, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      goal: { revenueGoal, averageTicketGoal, closingRateGoal, qualificationRateGoal },
      realized,
      gap,
      projection,
      closingsNeeded,
      opportunitiesNeeded,
      leadsNeeded,
      funnel,
      conversions,
      overallConversion,
      bySource,
      bottlenecks: { withoutNextAction, proposalsWithoutFollowUp, callsWithoutReturn, lostByObjection },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

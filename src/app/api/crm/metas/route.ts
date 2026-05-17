import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));

    const user = await getDefaultUser();
    const goal = await prisma.monthlyGoal.findUnique({
      where: { userId_month_year: { userId: user.id, month, year } },
      include: { items: { orderBy: { position: "asc" } } },
    });

    return NextResponse.json(goal ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();
    const {
      month, year,
      revenueGoal, newClientsGoal, leadsGoal, conversionGoal,
      averageTicketGoal, closingRateGoal, qualificationRateGoal,
      notes, items,
    } = body;

    const goalData = {
      revenueGoal:           revenueGoal           ?? 0,
      newClientsGoal:        newClientsGoal         ?? 0,
      leadsGoal:             leadsGoal              ?? 0,
      conversionGoal:        conversionGoal         ?? 0,
      averageTicketGoal:     averageTicketGoal      ?? 0,
      closingRateGoal:       closingRateGoal        ?? 0,
      qualificationRateGoal: qualificationRateGoal  ?? 0,
      notes:                 notes ?? null,
    };

    const goal = await prisma.monthlyGoal.upsert({
      where: { userId_month_year: { userId: user.id, month, year } },
      create: { userId: user.id, month, year, ...goalData },
      update: goalData,
    });

    await prisma.goalItem.deleteMany({ where: { goalId: goal.id } });
    if (Array.isArray(items) && items.length > 0) {
      await prisma.goalItem.createMany({
        data: items.map((item: { label: string; quantity: number; unitPrice: number }, i: number) => ({
          goalId:    goal.id,
          label:     item.label,
          quantity:  item.quantity,
          unitPrice: item.unitPrice,
          position:  i,
        })),
      });
    }

    const updated = await prisma.monthlyGoal.findUnique({
      where: { id: goal.id },
      include: { items: { orderBy: { position: "asc" } } },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

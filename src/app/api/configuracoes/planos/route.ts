import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const plans = await prisma.servicePlan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(plans);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();
    const plan = await prisma.servicePlan.create({
      data: {
        userId:        user.id,
        name:          body.name,
        description:   body.description ?? null,
        totalAmount:   body.totalAmount,
        installments:  body.installments ?? 1,
        durationMonths: body.durationMonths ?? 1,
        active:        true,
      },
    });
    return NextResponse.json(plan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

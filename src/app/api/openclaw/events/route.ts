import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  const user = await getDefaultUser();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
  const source = searchParams.get("source") || undefined;
  const status = searchParams.get("status") || undefined;

  const events = await prisma.openClawEvent.findMany({
    where: {
      userId: user.id,
      ...(source ? { source } : {}),
      ...(status ? { executionStatus: status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      chatId: true,
      source: true,
      rawCommand: true,
      interpretedIntent: true,
      executionStatus: true,
      response: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return NextResponse.json(events);
}

export async function DELETE() {
  const user = await getDefaultUser();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.openClawEvent.deleteMany({
    where: { userId: user.id, createdAt: { lt: cutoff } },
  });
  return NextResponse.json({ deleted: count });
}

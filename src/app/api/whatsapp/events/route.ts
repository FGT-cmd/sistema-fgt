import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  const user = await getDefaultUser();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

  const events = await prisma.whatsAppEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      phone: true,
      rawContent: true,
      messageType: true,
      interpretedIntent: true,
      status: true,
      response: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return NextResponse.json(events);
}

// Limpa eventos antigos (mais de 30 dias)
export async function DELETE() {
  const user = await getDefaultUser();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.whatsAppEvent.deleteMany({
    where: { userId: user.id, createdAt: { lt: cutoff } },
  });
  return NextResponse.json({ deleted: count });
}

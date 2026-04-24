import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  const user = await getDefaultUser();
  const clients = await prisma.client.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const user = await getDefaultUser();
  const body = await req.json();

  const client = await prisma.client.create({
    data: {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      tags: body.tags || [],
      notes: body.notes || null,
      source: body.source || null,
      status: "lead",
      userId: user.id,
    },
  });

  return NextResponse.json(client);
}

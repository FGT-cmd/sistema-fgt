import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interactions = await prisma.interaction.findMany({
    where: { clientId: id },
    orderBy: { date: "desc" },
    take: 20,
  });
  return NextResponse.json(interactions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDefaultUser();
  const body = await req.json();

  const interaction = await prisma.interaction.create({
    data: {
      type: body.type || "nota",
      content: body.content,
      clientId: id,
      userId: user.id,
    },
  });
  return NextResponse.json(interaction);
}

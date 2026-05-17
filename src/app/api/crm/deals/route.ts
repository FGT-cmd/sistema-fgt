import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  const user = await getDefaultUser();
  const deals = await prisma.deal.findMany({
    where: { userId: user.id },
    include: { client: { select: { id: true, name: true, phone: true, email: true, instagram: true } } },
    orderBy: [{ stage: "asc" }, { position: "asc" }],
  });
  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const user = await getDefaultUser();
  const body = await req.json();

  let clientId = body.clientId;

  if (!clientId && body.clientName) {
    const client = await prisma.client.create({
      data: {
        name:      body.clientName,
        email:     body.clientEmail     || null,
        phone:     body.clientPhone     || null,
        instagram: body.clientInstagram || null,
        status:    "lead",
        userId:    user.id,
      },
    });
    clientId = client.id;
  }

  const deal = await prisma.deal.create({
    data: {
      title:          body.title,
      value:          body.value          ? parseFloat(body.value)          : null,
      potentialValue: body.potentialValue ? parseFloat(body.potentialValue) : null,
      closedValue:    body.closedValue    ? parseFloat(body.closedValue)    : null,
      stage:          body.stage    || "novo_lead",
      priority:       body.priority || "medium",
      nextAction:     body.nextAction  || null,
      notes:          body.notes       || null,
      objection:      body.objection   || null,
      source:         body.source      || null,
      funnel:         body.funnel      || null,
      objectives:     body.objectives  || null,
      firstContact:   body.firstContact ? new Date(body.firstContact) : new Date(),
      clientId,
      userId: user.id,
    },
    include: { client: { select: { id: true, name: true, phone: true, email: true, instagram: true } } },
  });

  return NextResponse.json(deal);
}

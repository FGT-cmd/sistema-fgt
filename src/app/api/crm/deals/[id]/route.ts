import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const deal = await prisma.deal.update({
    where: { id },
    data: {
      ...(body.stage          !== undefined && { stage:          body.stage }),
      ...(body.title          !== undefined && { title:          body.title }),
      ...(body.value          !== undefined && { value:          body.value          ? parseFloat(String(body.value))          : null }),
      ...(body.potentialValue !== undefined && { potentialValue: body.potentialValue ? parseFloat(String(body.potentialValue)) : null }),
      ...(body.closedValue    !== undefined && { closedValue:    body.closedValue    ? parseFloat(String(body.closedValue))    : null }),
      ...(body.priority       !== undefined && { priority:       body.priority }),
      ...(body.nextAction     !== undefined && { nextAction:     body.nextAction  || null }),
      ...(body.notes          !== undefined && { notes:          body.notes       || null }),
      ...(body.objection      !== undefined && { objection:      body.objection   || null }),
      ...(body.source         !== undefined && { source:         body.source      || null }),
      ...(body.funnel         !== undefined && { funnel:         body.funnel      || null }),
      ...(body.objectives     !== undefined && { objectives:     body.objectives  || null }),
      ...(body.firstContact   !== undefined && { firstContact:   new Date(body.firstContact) }),
    },
    include: { client: { select: { id: true, name: true, phone: true, email: true, instagram: true } } },
  });

  if (body.clientName || body.clientEmail !== undefined || body.clientPhone !== undefined || body.clientInstagram !== undefined) {
    await prisma.client.update({
      where: { id: deal.clientId },
      data: {
        ...(body.clientName      && { name:      body.clientName }),
        ...(body.clientEmail     !== undefined && { email:     body.clientEmail     || null }),
        ...(body.clientPhone     !== undefined && { phone:     body.clientPhone     || null }),
        ...(body.clientInstagram !== undefined && { instagram: body.clientInstagram || null }),
      },
    });
  }

  return NextResponse.json(deal);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.deal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const projects = await prisma.project.findMany({
      where: { client: { userId: user.id } },
      include: {
        client: { select: { id: true, name: true } },
        tasks:  { orderBy: { position: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDefaultUser();
    const body = await req.json();

    let clientId = body.clientId;
    if (!clientId && body.clientName) {
      const client = await prisma.client.create({
        data: { name: body.clientName, status: "ativo", userId: user.id },
      });
      clientId = client.id;
    }

    const project = await prisma.project.create({
      data: {
        name:        body.name,
        description: body.description ?? null,
        status:      "em_andamento",
        clientId,
      },
      include: {
        client: { select: { id: true, name: true } },
        tasks:  true,
      },
    });
    return NextResponse.json(project);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

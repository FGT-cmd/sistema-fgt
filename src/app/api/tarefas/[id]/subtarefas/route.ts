import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const body = await req.json();

  const subtask = await prisma.subtask.create({
    data: {
      title: body.title,
      taskId,
    },
  });

  return NextResponse.json(subtask);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeStage } from "@/app/api/crm-alunos/route";

type Action = "iniciar_ciclo" | "iniciar_novo_ciclo" | "postergar_ciclo" | "pausar";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { action }: { action: Action } = await req.json();

  const journey = await prisma.studentJourney.findUnique({ where: { id } });
  if (!journey) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let data: Parameters<typeof prisma.studentJourney.update>[0]["data"] = {};

  if (action === "iniciar_ciclo") {
    data = { cycleStartDate: new Date(), isPaused: false };
  } else if (action === "iniciar_novo_ciclo") {
    data = {
      cycleStartDate: new Date(),
      currentCycleNumber: journey.currentCycleNumber + 1,
      isPaused: false,
    };
  } else if (action === "postergar_ciclo") {
    if (!journey.cycleStartDate) {
      return NextResponse.json({ error: "cycle_not_started" }, { status: 409 });
    }
    const shifted = new Date(journey.cycleStartDate);
    shifted.setDate(shifted.getDate() + 7);
    data = { cycleStartDate: shifted };
  } else if (action === "pausar") {
    data = { isPaused: !journey.isPaused };
  } else {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const updated = await prisma.studentJourney.update({ where: { id }, data });
  return NextResponse.json({ ...updated, computedStage: computeStage(updated) });
}

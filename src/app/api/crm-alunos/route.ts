import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export function computeStage(journey: {
  isPaused: boolean;
  cycleStartDate: Date | null;
  cycleLengthWeeks: number;
}): string {
  if (journey.isPaused) return "pausado";
  if (!journey.cycleStartDate) return "alunos_novos";
  const diffDays = (Date.now() - journey.cycleStartDate.getTime()) / 86_400_000;
  const week = Math.floor(diffDays / 7) + 1;
  if (week >= 1 && week <= journey.cycleLengthWeeks) return `semana_${week}`;
  return "atualizacao_treino";
}

export async function GET() {
  const user = await getDefaultUser();

  const journeys = await prisma.studentJourney.findMany({
    where: { client: { userId: user.id } },
    include: {
      client: {
        select: { id: true, name: true, phone: true, planName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = journeys.map((j) => ({ ...j, computedStage: computeStage(j) }));
  return NextResponse.json(data);
}

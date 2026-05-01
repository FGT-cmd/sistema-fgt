import { prisma } from "@/lib/prisma";
import type { OCIntent, OCExtractedData, OCEnriched, OCPendingSession } from "./types";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

export async function getOCPendingSession(chatId: string): Promise<OCPendingSession | null> {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  const event = await prisma.openClawEvent.findFirst({
    where: { chatId, executionStatus: "waiting_confirmation", createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  });
  if (!event || !event.confirmationPayload) return null;

  const payload = event.confirmationPayload as {
    intent: OCIntent;
    data: OCExtractedData;
    enriched: OCEnriched;
  };
  return { id: event.id, intent: payload.intent, data: payload.data, enriched: payload.enriched };
}

export async function cancelOCPendingSessions(chatId: string) {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  await prisma.openClawEvent.updateMany({
    where: { chatId, executionStatus: "waiting_confirmation", createdAt: { gte: cutoff } },
    data: { executionStatus: "cancelled" },
  });
}

export async function updateOCEventStatus(
  id: string,
  executionStatus: string,
  response?: string,
  errorMessage?: string,
) {
  await prisma.openClawEvent.update({
    where: { id },
    data: { executionStatus, response, errorMessage, updatedAt: new Date() },
  });
}

export function isOCConfirmation(msg: string): boolean {
  const n = msg.toLowerCase().trim().replace(/[!.,?]/g, "");
  return ["sim", "s", "ok", "confirmar", "confirma", "yes", "pode", "pode sim",
    "1", "confirmado", "bora", "vai", "certo"].some(w => n === w || n.startsWith(w + " "));
}

export function isOCCancellation(msg: string): boolean {
  const n = msg.toLowerCase().trim().replace(/[!.,?]/g, "");
  return ["não", "nao", "n", "cancelar", "cancela", "no", "2",
    "desistir", "para", "esquece"].some(w => n === w);
}

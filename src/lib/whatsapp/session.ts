import { prisma } from "@/lib/prisma";
import type { Intent, ExtractedData, PendingSession } from "./types";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

// Busca sessão de confirmação pendente para este telefone
export async function getPendingSession(phone: string): Promise<PendingSession | null> {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  const event = await prisma.whatsAppEvent.findFirst({
    where: {
      phone,
      status: "waiting_confirmation",
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!event || !event.extractedData) return null;

  const data = event.extractedData as { action: Intent; data: ExtractedData; enriched?: PendingSession["enriched"] };
  return {
    id: event.id,
    action: data.action,
    data: data.data,
    enriched: data.enriched,
  };
}

// Cancela sessões pendentes para este telefone
export async function cancelPendingSession(phone: string) {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  await prisma.whatsAppEvent.updateMany({
    where: { phone, status: "waiting_confirmation", createdAt: { gte: cutoff } },
    data: { status: "cancelled" },
  });
}

// Atualiza status de um evento específico
export async function updateEventStatus(
  id: string,
  status: string,
  response?: string,
  errorMessage?: string
) {
  await prisma.whatsAppEvent.update({
    where: { id },
    data: { status, response, errorMessage, updatedAt: new Date() },
  });
}

// Verifica se a mensagem é uma confirmação
export function isConfirmation(message: string): boolean {
  const n = message.toLowerCase().trim().replace(/[!.,?]/g, "");
  return [
    "sim", "s", "ok", "confirmar", "confirma", "yes",
    "pode", "pode sim", "1", "confirmado", "bora", "vai", "certo",
  ].includes(n);
}

// Verifica se a mensagem é uma cancela
export function isCancellation(message: string): boolean {
  const n = message.toLowerCase().trim().replace(/[!.,?]/g, "");
  return [
    "não", "nao", "n", "cancelar", "cancela", "no",
    "2", "desistir", "para", "esquece",
  ].includes(n);
}

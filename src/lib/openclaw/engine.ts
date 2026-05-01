/**
 * Engine central do OpenClaw Assistant.
 * Ponto único de entrada — independente de Telegram, WhatsApp ou qualquer interface.
 *
 * Fluxo:
 * 1. Checa sessão pendente (confirmação)
 * 2. Se confirmação → executa ação armazenada
 * 3. Se nova mensagem → classifica → enriquece → armazena ou executa
 * 4. Loga tudo em OpenClawEvent
 */

import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { classifyOCMessage } from "./classifier";
import {
  getOCPendingSession, cancelOCPendingSessions,
  isOCConfirmation, isOCCancellation, updateOCEventStatus,
} from "./session";
import {
  getDailyPendingSummary,
  enrichCreateStudent, createStudent,
  enrichRegisterPayment, registerPayment,
  createTask, enrichAddStudentNote, addStudentNote,
  enrichSaveContentIdea, saveContentIdea,
} from "./actions";
import type {
  OCProcessResult, OCIntent, OCExtractedData, OCEnriched,
  OCCreateStudentData, OCRegisterPaymentData, OCCreateTaskData,
  OCAddStudentNoteData, OCSaveContentIdeaData, OCQueryPendingData,
} from "./types";
import { findClientMatches } from "@/lib/whatsapp/executor";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

// ─── Monta mensagem de confirmação ───────────────────────────────

function buildConfirmation(intent: OCIntent, data: OCExtractedData, enriched: OCEnriched): string {
  if (intent === "create_student") {
    const d = data as OCCreateStudentData;
    const planLine = enriched.planDisplayName
      ? `• Plano: *${enriched.planDisplayName}* (${fmt(enriched.planTotal!)} — ${enriched.planInstallments}x ${fmt(enriched.planTotal! / enriched.planInstallments!)})\n`
      : d.planName ? `• Plano: ${d.planName} _(não encontrado — sem financeiro)_\n` : "";
    const objLine = d.objective ? `• Objetivo: ${d.objective}\n` : "";
    const whatWillDo = enriched.planId
      ? "1. Criar a aluna\n2. Gerar negociação com parcelas\n3. Criar 3 tarefas de onboarding"
      : "1. Criar a aluna\n2. Criar 3 tarefas de onboarding";
    return `🎓 Vou criar esta aluna:\n\n• *${d.name}*\n${planLine}${objLine}\nAo confirmar vou:\n${whatWillDo}\n\nConfirmar? _(sim/não)_`;
  }

  if (intent === "register_payment") {
    const d = data as OCRegisterPaymentData;
    const name = enriched.clientName ?? d.studentName;
    const amount = enriched.installmentAmount ?? d.amount;
    const dateLine = d.date ? `\n• Data: ${fmtDate(d.date)}` : "\n• Data: hoje";
    const linkLine = enriched.installmentId
      ? "\n• Parcela vinculada encontrada ✓"
      : "\n• _(lançamento avulso — sem parcela vinculada)_";
    return `💰 Vou registrar este pagamento:\n\n• *${name}*\n• Valor: ${fmt(amount)}\n• Forma: ${d.paymentMethod}${dateLine}${linkLine}\n\nConfirmar? _(sim/não)_`;
  }

  if (intent === "create_task") {
    const d = data as OCCreateTaskData;
    const clientLine = enriched.clientName
      ? `\n• Aluna: ${enriched.clientName}`
      : d.studentName ? `\n• Aluna: ${d.studentName} _(sem vínculo)_` : "";
    const dateLine = d.dueDate ? `\n• Data: ${fmtDate(d.dueDate)}` : "";
    return `📋 Vou criar esta tarefa:\n\n• *${d.title}*${clientLine}${dateLine}\n\nConfirmar? _(sim/não)_`;
  }

  if (intent === "add_student_note") {
    const d = data as OCAddStudentNoteData;
    const name = enriched.clientName ?? d.studentName;
    return `📝 Vou salvar esta observação para *${name}*:\n\n_"${d.note}"_\n\nConfirmar? _(sim/não)_`;
  }

  if (intent === "save_content_idea") {
    const d = data as OCSaveContentIdeaData;
    const formatEmoji = { reels: "🎬", stories: "📱", carrossel: "🎠" }[enriched.suggestedFormat || "reels"] ?? "💡";
    return `${formatEmoji} Vou salvar esta ideia:\n\n_"${d.idea}"_\n\n• Formato sugerido: *${enriched.suggestedFormat}*\n• Gancho: _"${enriched.hook}"_\n\nConfirmar? _(sim/não)_`;
  }

  return "Confirmar? _(sim/não)_";
}

// ─── Enriquece dados por intent ───────────────────────────────────

async function enrichData(
  intent: OCIntent,
  data: OCExtractedData,
  userId: string,
): Promise<{ valid: boolean; message?: string; enriched: OCEnriched }> {
  if (intent === "create_student") {
    return enrichCreateStudent(data as OCCreateStudentData, userId);
  }

  if (intent === "register_payment") {
    return enrichRegisterPayment(data as OCRegisterPaymentData, userId);
  }

  if (intent === "create_task") {
    const d = data as OCCreateTaskData;
    if (!d.studentName) return { valid: true, enriched: {} };
    const clients = await prisma.client.findMany({ where: { userId }, select: { id: true, name: true } });
    const matches = findClientMatches(d.studentName, clients);
    if (matches.length > 1) {
      const list = matches.slice(0, 4).map((c, i) => `${i + 1}. ${c.name}`).join("\n");
      return { valid: false, message: `Encontrei mais de uma aluna com esse nome:\n${list}\n\nQual delas?`, enriched: {} };
    }
    const enriched = matches[0] ? { clientId: matches[0].id, clientName: matches[0].name } : {};
    return { valid: true, enriched };
  }

  if (intent === "add_student_note") {
    return enrichAddStudentNote(data as OCAddStudentNoteData, userId);
  }

  if (intent === "save_content_idea") {
    const d = data as OCSaveContentIdeaData;
    const enriched = await enrichSaveContentIdea(d.idea);
    return { valid: true, enriched };
  }

  return { valid: true, enriched: {} };
}

// ─── Executa ação confirmada ──────────────────────────────────────

async function executeConfirmed(
  intent: OCIntent,
  data: OCExtractedData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  switch (intent) {
    case "create_student":
      return createStudent(data as OCCreateStudentData, enriched, userId);
    case "register_payment":
      return registerPayment(data as OCRegisterPaymentData, enriched, userId);
    case "create_task":
      return createTask(data as OCCreateTaskData, enriched, userId);
    case "add_student_note":
      return addStudentNote(data as OCAddStudentNoteData, enriched, userId);
    case "save_content_idea":
      return saveContentIdea(data as OCSaveContentIdeaData, enriched, userId);
    default:
      return "Ação executada.";
  }
}

// ─── Entry point principal ────────────────────────────────────────

export async function processOpenClawMessage(params: {
  chatId: string;
  message: string;
  source?: string;
}): Promise<OCProcessResult> {
  const { chatId, message, source = "telegram" } = params;
  const user = await getDefaultUser();
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. SESSÃO PENDENTE ────────────────────────────────────────────
  const pending = await getOCPendingSession(chatId);

  if (pending) {
    if (isOCConfirmation(message)) {
      try {
        const response = await executeConfirmed(pending.intent, pending.data, pending.enriched, user.id);
        await updateOCEventStatus(pending.id, "executed", response);
        return { response, intent: pending.intent, status: "executed", eventId: pending.id };
      } catch (err) {
        const errMsg = String(err);
        await updateOCEventStatus(pending.id, "failed", undefined, errMsg);
        return { response: "Erro ao executar. Tente novamente.", intent: pending.intent, status: "failed" };
      }
    }

    if (isOCCancellation(message)) {
      await updateOCEventStatus(pending.id, "cancelled", "Cancelado");
      return { response: "Ok, cancelei. 👍 No que mais posso ajudar?", intent: "unknown", status: "cancelled" };
    }

    // Nova mensagem — cancela pendência anterior
    await cancelOCPendingSessions(chatId);
  }

  // ── 2. CLASSIFICA NOVA MENSAGEM ───────────────────────────────────
  const clients = await prisma.client.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const clientList = clients.map(c => c.name).join(", ");

  let classification: Awaited<ReturnType<typeof classifyOCMessage>>;
  try {
    classification = await classifyOCMessage(message, clientList, today);
  } catch (err) {
    await prisma.openClawEvent.create({
      data: { chatId, source, rawCommand: message, executionStatus: "failed", errorMessage: "Falha na classificação", userId: user.id },
    });
    return { response: "Não consegui entender. Tente reformular.", intent: "unknown", status: "failed" };
  }

  const { intent, data } = classification;

  // ── 3. QUERY DIRETA (sem confirmação) ─────────────────────────────
  if (intent === "query_pending") {
    const d = data as OCQueryPendingData;
    const response = await getDailyPendingSummary(user.id, d.queryType || "general");
    await prisma.openClawEvent.create({
      data: { chatId, source, rawCommand: message, interpretedIntent: intent, extractedData: data as object, executionStatus: "executed", response, userId: user.id },
    });
    return { response, intent, status: "executed" };
  }

  if (intent === "unknown") {
    const response = "Não entendi esse comando. Posso te ajudar a:\n• Consultar pendências\n• Criar aluna\n• Registrar pagamento\n• Criar tarefa\n• Salvar observação\n• Salvar ideia de conteúdo";
    await prisma.openClawEvent.create({
      data: { chatId, source, rawCommand: message, interpretedIntent: intent, executionStatus: "received", response, userId: user.id },
    });
    return { response, intent, status: "executed" };
  }

  // ── 4. ENRIQUECE DADOS ────────────────────────────────────────────
  const enrichResult = await enrichData(intent, data, user.id);

  if (!enrichResult.valid) {
    await prisma.openClawEvent.create({
      data: { chatId, source, rawCommand: message, interpretedIntent: intent, extractedData: data as object, executionStatus: "failed", response: enrichResult.message, userId: user.id },
    });
    return { response: enrichResult.message || "Não consegui processar.", intent, status: "failed" };
  }

  // Se enrichSaveContentIdea voltou com mensagem (plano não encontrado mas continua)
  if (enrichResult.message) {
    // Avisa mas não bloqueia — continua com confirmação
    console.log("[OpenClaw] Enrich warning:", enrichResult.message);
  }

  // ── 5. MONTA CONFIRMAÇÃO E ARMAZENA ──────────────────────────────
  const confirmationMsg = buildConfirmation(intent, data, enrichResult.enriched);
  const confirmationPayload = { intent, data, enriched: enrichResult.enriched };

  const event = await prisma.openClawEvent.create({
    data: {
      chatId, source, rawCommand: message,
      interpretedIntent: intent,
      extractedData: data as object,
      confirmationPayload: confirmationPayload as object,
      executionStatus: "waiting_confirmation",
      userId: user.id,
    },
  });

  return {
    response: confirmationMsg,
    intent,
    status: "waiting_confirmation",
    waitingConfirmation: true,
    eventId: event.id,
  };
}

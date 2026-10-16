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
import { captureText } from "@/lib/financeiro/capture/run";
import { buildCaptureButtons } from "@/lib/financeiro/capture/telegramUi";
import { answerFinanceQuestion } from "@/lib/financeiro/ask/answer";
import type { TelegramButton } from "@/lib/telegram";

// ─── Upsert helper ────────────────────────────────────────────────
// If existingId is provided, updates that event; otherwise creates a new one.

type EventData = {
  chatId: string;
  source: string;
  rawCommand: string;
  interpretedIntent?: string;
  extractedData?: object;
  confirmationPayload?: object;
  executionStatus?: string;
  response?: string | null;
  errorMessage?: string | null;
  userId: string;
};

async function persistEvent(existingId: string | undefined, data: EventData): Promise<string> {
  if (existingId) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId: _uid, ...updateData } = data;
    await prisma.openClawEvent.update({ where: { id: existingId }, data: updateData });
    return existingId;
  }
  const ev = await prisma.openClawEvent.create({ data });
  return ev.id;
}
import {
  getOCPendingSession, cancelOCPendingSessions,
  isOCConfirmation, isOCCancellation, updateOCEventStatus,
} from "./session";
import {
  queryCRM, createLead, listStudents,
  enrichCreateStudent, createStudent,
  enrichRegisterPayment, registerPayment,
  enrichAddStudentNote, addStudentNote,
  enrichSaveContentIdea, saveContentIdea,
} from "./actions";
import { opCheckoutCreate, opCreateTask, opGetPending, opLayerUserMessage } from "./opClient";
import { parseTelegramCheckoutLinkCommand } from "@/lib/checkout-telegram-parse";
import type {
  OCProcessResult, OCIntent, OCExtractedData, OCEnriched,
  OCCreateStudentData, OCRegisterPaymentData, OCCreateTaskData,
  OCAddStudentNoteData, OCSaveContentIdeaData, OCQueryPendingData,
  OCQueryCRMData, OCCreateLeadData, OCQueryStudentsData,
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

  if (intent === "create_lead") {
    const d = data as OCCreateLeadData;
    const sourceLine = d.source ? `\n• Origem: ${d.source}` : "";
    const valueLine = d.value ? `\n• Valor estimado: R$ ${d.value}` : "";
    const nextLine = d.nextAction ? `\n• Próxima ação: ${d.nextAction}` : "";
    const objLine = d.objectives ? `\n• Objetivos: ${d.objectives}` : "";
    return `🎯 Vou criar este lead no CRM:\n\n• *${d.name}*${sourceLine}${valueLine}${objLine}${nextLine}\n\nConfirmar? _(sim/não)_`;
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

  // create_lead e query_crm não precisam de enriquecimento
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
      return opCreateTask(data as OCCreateTaskData, enriched, userId);
    case "add_student_note":
      return addStudentNote(data as OCAddStudentNoteData, enriched, userId);
    case "save_content_idea":
      return saveContentIdea(data as OCSaveContentIdeaData, enriched, userId);
    case "create_lead":
      return createLead(data as OCCreateLeadData, userId);
    default:
      return "Ação executada.";
  }
}

// ─── Detector de intenção documental (barreira pré-classificação) ─

const DOCUMENTAL_PATTERNS = [
  /\banalis[ae]\s+(o\s+)?(código|sistema|arquitetura|arquivo|documento)/i,
  /\brevise?\s+(o\s+)?(código|sistema|implementa)/i,
  /\bexplique?\s+(o\s+)?(código|sistema|arquitetura|implementa)/i,
  /\bleia?\s+(o\s+)?(arquivo|documento|código|drive)/i,
  /\barquitetura\s+do\s+sistema/i,
  /\bgoogle\s*drive\b/i,
  /\bdatabase[_\s]url\b/i,
  /\bvari[aá]vel\s+de\s+ambiente/i,
  /\bcódigo[- ]fonte\b/i,
  /\bimplementa[çc][aã]o\s+(do|da)\s+sistema/i,
  /\bver\s+(o\s+)?(código|arquivo|documento|arquitetura)/i,
  /\bveja\s+(o\s+)?(código|arquivo|documento|arquitetura)/i,
];

function isDocumentalRequest(msg: string): boolean {
  return DOCUMENTAL_PATTERNS.some(p => p.test(msg));
}

const DOCUMENTAL_RESPONSE =
  "Análise de arquivos e documentação não é minha função aqui.\n\n" +
  "Posso operar o sistema:\n" +
  "• Consultar pendências e pagamentos\n" +
  "• Criar aluna ou lead\n" +
  "• Lançar entradas e saídas, e responder sobre o financeiro\n" +
  "• Criar tarefa ou observação\n" +
  "• Salvar ideia de conteúdo";

// ─── Entry point principal ────────────────────────────────────────

export async function processOpenClawMessage(params: {
  chatId: string;
  message: string;
  source?: string;
  existingEventId?: string;
}): Promise<OCProcessResult> {
  const { chatId, message, source = "telegram", existingEventId } = params;
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
        const response =
          pending.intent === "create_task"
            ? opLayerUserMessage(err)
            : "Falha operacional ao executar a ação. O sistema pode estar temporariamente inacessível. Tente novamente em instantes.";
        return { response, intent: pending.intent, status: "failed" };
      }
    }

    if (isOCCancellation(message)) {
      await updateOCEventStatus(pending.id, "cancelled", "Cancelado");
      return { response: "Ok, cancelei. 👍 No que mais posso ajudar?", intent: "unknown", status: "cancelled", eventId: pending.id };
    }

    // Nova mensagem — cancela pendência anterior
    await cancelOCPendingSessions(chatId);
  }

  // ── 2. BARREIRA: rejeita pedidos documentais antes de chamar IA ──
  if (isDocumentalRequest(message)) {
    const evDocId = await persistEvent(existingEventId, { chatId, source, rawCommand: message, interpretedIntent: "unknown", executionStatus: "received", response: DOCUMENTAL_RESPONSE, userId: user.id });
    console.log(`[OpenClaw] Event persisted: id=${evDocId} intent=unknown status=received source=${source} chatId=${chatId}`);
    return { response: DOCUMENTAL_RESPONSE, intent: "unknown", status: "executed", eventId: evDocId };
  }

  const checkoutCmd = parseTelegramCheckoutLinkCommand(message);
  if (checkoutCmd) {
    let response: string;
    try {
      response = await opCheckoutCreate({
        productName: checkoutCmd.productName,
        amountCents: checkoutCmd.amountCents,
        source: "telegram",
      });
      const evCoId = await persistEvent(existingEventId, {
        chatId, source, rawCommand: message, interpretedIntent: "checkout_create",
        extractedData: { productName: checkoutCmd.productName, amountCents: checkoutCmd.amountCents } as object,
        executionStatus: "executed", response, userId: user.id,
      });
      console.log(`[OpenClaw] Event persisted: id=${evCoId} intent=checkout_create status=executed source=${source} chatId=${chatId}`);
      return { response, intent: "unknown", status: "executed", eventId: evCoId };
    } catch (err) {
      const errMsg = String(err);
      response = opLayerUserMessage(err);
      const evCoFId = await persistEvent(existingEventId, {
        chatId, source, rawCommand: message, interpretedIntent: "checkout_create",
        executionStatus: "failed", errorMessage: errMsg, response, userId: user.id,
      });
      console.log(`[OpenClaw] Event persisted: id=${evCoFId} intent=checkout_create status=failed source=${source} chatId=${chatId}`);
      return { response, intent: "unknown", status: "failed", eventId: evCoFId };
    }
  }

  // ── 3. CLASSIFICA NOVA MENSAGEM ───────────────────────────────────
  const clients = await prisma.client.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const clientList = clients.map(c => c.name).join(", ");

  let classification: Awaited<ReturnType<typeof classifyOCMessage>>;
  try {
    classification = await classifyOCMessage(message, clientList, today);
  } catch (classifyErr) {
    const errMsg = String(classifyErr);
    const isRateLimit = /rate.?limit|all models|overloaded|temporarily unavailable/i.test(errMsg);
    const response = isRateLimit
      ? "Estou com limite temporário no modelo de IA. Tente novamente em alguns minutos ou use comandos diretos como: resumo do dia, tarefas de hoje, pendências ou quem não pagou."
      : "Sistema operacional indisponível no momento. Tente novamente em instantes.";
    let evIdClassErr: string | undefined;
    try {
      evIdClassErr = await persistEvent(existingEventId, { chatId, source, rawCommand: message, executionStatus: "failed", errorMessage: errMsg, response, userId: user.id });
      console.log(`[OpenClaw] Event persisted: id=${evIdClassErr} status=failed source=${source} chatId=${chatId} (classifier error)`);
    } catch (saveErr) {
      console.error("[OpenClaw] classifier event save failed:", saveErr);
    }
    return { response, intent: "unknown", status: "failed", eventId: evIdClassErr };
  }

  const { intent, data } = classification;

  // ── 3b. FINANCEIRO (captura e perguntas, sem confirmação) ─────────
  if (intent === "finance_capture" || intent === "finance_ask") {
    let response: string;
    let buttons: TelegramButton[][] | undefined;
    let finStatus: "executed" | "failed" = "executed";
    let finError: string | undefined;
    try {
      if (intent === "finance_capture") {
        const r = await captureText(message, source === "jarvis" ? "jarvis" : "telegram");
        response = r.summary;
        buttons = buildCaptureButtons(r);
      } else {
        response = await answerFinanceQuestion(message);
      }
    } catch (err) {
      finStatus = "failed";
      finError = String(err);
      response = "Falha no financeiro agora. Tenta de novo em instantes.";
    }
    let evIdFin: string | undefined;
    try {
      evIdFin = await persistEvent(existingEventId, {
        chatId, source, rawCommand: message, interpretedIntent: intent,
        executionStatus: finStatus, errorMessage: finError, response, userId: user.id,
      });
    } catch (saveErr) {
      console.error("[OpenClaw] finance event save failed:", saveErr);
    }
    return { response, intent, status: finStatus, eventId: evIdFin, buttons };
  }

  // ── 4. QUERY DIRETA (sem confirmação) ─────────────────────────────
  if (intent === "query_pending") {
    const d = data as OCQueryPendingData;
    let response: string;
    let pendingStatus: "executed" | "failed" = "executed";
    let pendingError: string | undefined;
    try {
      response = await opGetPending(user.id, d.queryType || "general");
    } catch (err) {
      pendingStatus = "failed";
      pendingError = String(err);
      response = opLayerUserMessage(err);
    }
    let evIdQP: string | undefined;
    try {
      evIdQP = await persistEvent(existingEventId, { chatId, source, rawCommand: message, interpretedIntent: intent, extractedData: data as object, executionStatus: pendingStatus, errorMessage: pendingError, response, userId: user.id });
      console.log(`[OpenClaw] Event persisted: id=${evIdQP} intent=${intent} status=${pendingStatus} source=${source} chatId=${chatId}`);
    } catch (saveErr) {
      console.error("[OpenClaw] query_pending event save failed:", saveErr);
    }
    return { response, intent, status: pendingStatus, eventId: evIdQP };
  }

  if (intent === "query_crm") {
    const d = data as OCQueryCRMData;
    let response: string;
    let crmStatus: "executed" | "failed" = "executed";
    let crmError: string | undefined;
    try {
      response = await queryCRM(user.id, d.queryType || "general");
    } catch (err) {
      crmStatus = "failed";
      crmError = String(err);
      response = "Sistema operacional indisponível. Não foi possível consultar o CRM agora. Tente novamente em instantes.";
    }
    let evIdCRM: string | undefined;
    try {
      evIdCRM = await persistEvent(existingEventId, { chatId, source, rawCommand: message, interpretedIntent: intent, extractedData: data as object, executionStatus: crmStatus, errorMessage: crmError, response, userId: user.id });
      console.log(`[OpenClaw] Event persisted: id=${evIdCRM} intent=${intent} status=${crmStatus} source=${source} chatId=${chatId}`);
    } catch (saveErr) {
      console.error("[OpenClaw] query_crm event save failed:", saveErr);
    }
    return { response, intent, status: crmStatus, eventId: evIdCRM };
  }

  if (intent === "query_students") {
    const d = data as OCQueryStudentsData;
    let response: string;
    let qsStatus: "executed" | "failed" = "executed";
    let qsError: string | undefined;
    try {
      response = await listStudents(user.id, d.filter ?? "ativos");
    } catch (err) {
      qsStatus = "failed";
      qsError = String(err);
      response = "Sistema operacional indisponível. Não foi possível consultar os alunos agora. Tente novamente em instantes.";
    }
    let evIdQS: string | undefined;
    try {
      evIdQS = await persistEvent(existingEventId, { chatId, source, rawCommand: message, interpretedIntent: intent, extractedData: data as object, executionStatus: qsStatus, errorMessage: qsError, response, userId: user.id });
      console.log(`[OpenClaw] Event persisted: id=${evIdQS} intent=${intent} status=${qsStatus} source=${source} chatId=${chatId}`);
    } catch (saveErr) {
      console.error("[OpenClaw] query_students event save failed:", saveErr);
    }
    return { response, intent, status: qsStatus, eventId: evIdQS };
  }

  if (intent === "unknown") {
    const response = "Não reconheci esse comando como uma operação do sistema.\n\nPosso executar:\n• *Consultar pendências* — \"quem não pagou?\", \"o que está atrasado?\"\n• *Listar alunos* — \"quem são os alunos?\", \"lista de clientes\"\n• *Criar aluna* — \"criar aluna Ana, plano semestral\"\n• *Registrar pagamento* — \"Ana pagou 300 no pix\"\n• *Criar tarefa* — \"me lembra de cobrar Bruna sexta\"\n• *Salvar observação* — \"obs da Ana: relatou fome à noite\"\n• *Salvar ideia* — \"ideia de conteúdo: ...\"\n• *Criar lead* — \"Ana quer contratar, veio pelo Instagram\"";
    let evIdUnk: string | undefined;
    try {
      evIdUnk = await persistEvent(existingEventId, { chatId, source, rawCommand: message, interpretedIntent: intent, executionStatus: "received", response, userId: user.id });
      console.log(`[OpenClaw] Event persisted: id=${evIdUnk} intent=unknown status=received source=${source} chatId=${chatId}`);
    } catch (saveErr) {
      console.error("[OpenClaw] unknown intent event save failed:", saveErr);
    }
    return { response, intent, status: "executed", eventId: evIdUnk };
  }

  // ── 5. ENRIQUECE DADOS ────────────────────────────────────────────
  const enrichResult = await enrichData(intent, data, user.id);

  if (!enrichResult.valid) {
    let evIdEnr: string | undefined;
    try {
      evIdEnr = await persistEvent(existingEventId, { chatId, source, rawCommand: message, interpretedIntent: intent, extractedData: data as object, executionStatus: "failed", response: enrichResult.message, userId: user.id });
      console.log(`[OpenClaw] Event persisted: id=${evIdEnr} intent=${intent} status=failed source=${source} chatId=${chatId} (enrich invalid)`);
    } catch (saveErr) {
      console.error("[OpenClaw] enrich-invalid event save failed:", saveErr);
    }
    return { response: enrichResult.message || "Não foi possível processar essa ação. Verifique os dados e tente novamente.", intent, status: "failed", eventId: evIdEnr };
  }

  // ── 6. MONTA CONFIRMAÇÃO E ARMAZENA ──────────────────────────────
  // Prepend warning ao usuário se enriquecimento encontrou problema mas não bloqueou
  const warningPrefix = enrichResult.message ? `${enrichResult.message}\n\n` : "";
  const confirmationMsg = warningPrefix + buildConfirmation(intent, data, enrichResult.enriched);
  const confirmationPayload = { intent, data, enriched: enrichResult.enriched };

  const evConfId = await persistEvent(existingEventId, {
    chatId, source, rawCommand: message,
    interpretedIntent: intent,
    extractedData: data as object,
    confirmationPayload: confirmationPayload as object,
    executionStatus: "waiting_confirmation",
    userId: user.id,
  });

  return {
    response: confirmationMsg,
    intent,
    status: "waiting_confirmation",
    waitingConfirmation: true,
    eventId: evConfId,
  };
}

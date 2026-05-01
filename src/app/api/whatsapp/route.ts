import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import {
  getPendingSession, cancelPendingSession,
  isConfirmation, isCancellation, updateEventStatus,
} from "@/lib/whatsapp/session";
import {
  enrichBeforeConfirm, buildConfirmationMessage,
  executeAction, executeQuery, findClientMatches,
} from "@/lib/whatsapp/executor";
import type { Intent, ExtractedData, ClassificationResult } from "@/lib/whatsapp/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const WHATSAPP_SECRET   = process.env.WHATSAPP_SECRET;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const GROQ_API_KEY      = process.env.GROQ_API_KEY;

// ─── Mídia ────────────────────────────────────────────────────────

async function getMediaBase64(messageData: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: { "apikey": EVOLUTION_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageData, convertToMp4: false }),
    });
    const data = await res.json();
    return data.base64 || null;
  } catch { return null; }
}

async function transcribeAudio(base64: string): Promise<string> {
  const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
  const buffer = Buffer.from(b64, "base64");
  const blob = new Blob([buffer], { type: "audio/ogg" });
  const formData = new FormData();
  formData.append("file", blob, "audio.ogg");
  formData.append("model", "whisper-large-v3");
  formData.append("language", "pt");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });
  const data = await res.json();
  return data.text || "";
}

async function extractImageInfo(base64: string): Promise<string> {
  const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
  const mediaType = base64.includes("png") ? "image/png" : "image/jpeg";
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
        { type: "text", text: "Analise esta imagem. Se for comprovante de pagamento, extraia: valor, data, descrição, forma de pagamento. Caso contrário, descreva o que é. Responda em português, de forma curta." },
      ],
    }],
  });
  return (res.content[0] as { text: string }).text;
}

// ─── Classificação de intenção ────────────────────────────────────

async function classifyIntent(
  message: string,
  clientList: string,
  pendingTasksSummary: string,
  today: string,
): Promise<ClassificationResult> {
  const systemPrompt = `Você é o assistente operacional do Fernando Gomes, consultor de fitness.
Hoje é ${today}.

ALUNOS/CLIENTES CADASTRADOS:
${clientList || "Nenhum cadastrado"}

RESUMO DE TAREFAS PENDENTES:
${pendingTasksSummary || "Nenhuma"}

Analise a mensagem e retorne APENAS um JSON válido (sem markdown) com:
{
  "action": "create_task" | "register_payment" | "list_tasks" | "day_summary" | "query_pending" | "create_expense" | "mark_paid" | "unknown",
  "data": { ... campos conforme action ... },
  "response": "resposta direta para queries/erros. VAZIO para create_task, register_payment, create_expense."
}

CAMPOS POR ACTION:
- create_task: { "title": string, "dueDate"?: "YYYY-MM-DD", "studentName"?: string, "type"?: "general"|"student"|"financial"|"content"|"commercial"|"administrative" }
- register_payment: { "studentName": string, "amount": number, "paymentMethod": "Pix"|"Dinheiro"|"Cartão"|"Transferência"|"Débito"|"Crédito", "date"?: "YYYY-MM-DD" }
- query_pending: { "queryType": "who_didnt_pay" | "overdue" | "today" | "general" }
- create_expense: { "description": string, "amount": number, "category": "Ferramenta/Software"|"Marketing"|"Operação"|"Imposto"|"Equipe/Serviço"|"Despesas Gerais", "dueDate"?: "YYYY-MM-DD" }
- mark_paid: { "description": string }
- list_tasks, day_summary, unknown: {}

REGRAS:
- Para create_task, register_payment, create_expense: deixe "response" VAZIO — o sistema gera a confirmação.
- Para queries (list_tasks, day_summary, query_pending): preencha "response" com texto útil e amigável.
- Datas naturais: hoje=${today}, amanhã=dia seguinte, "segunda"=próxima segunda, etc. → YYYY-MM-DD.
- NUNCA invente ou corrija nomes. Use exatamente o que está escrito.
- query_pending + "quem não pagou" → queryType: "who_didnt_pay"
- query_pending + "atrasado/vencido" → queryType: "overdue"
- query_pending + "hoje/dia" → queryType: "today"`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: message }],
  });

  const raw = (res.content[0] as { text: string }).text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta Claude sem JSON válido");

  return JSON.parse(jsonMatch[0]) as ClassificationResult;
}

// ─── Webhook principal ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-whatsapp-secret");
    if (WHATSAPP_SECRET && secret !== WHATSAPP_SECRET) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const phone: string = body.phone || body.from || "test";
    const messageType: string = body.messageType || "text";

    // Bloqueia grupos e broadcasts
    if (phone.includes("@g.us") || phone.includes("@broadcast")) {
      return NextResponse.json({ response: null }, { status: 200 });
    }

    // Whitelist de telefone
    const ALLOWED_PHONE = process.env.ALLOWED_PHONE;
    if (ALLOWED_PHONE && !phone.includes(ALLOWED_PHONE)) {
      return NextResponse.json({ response: null }, { status: 200 });
    }

    const messageObj: Record<string, unknown> = body.messageObj || {};
    let message: string = body.message || body.text || "";

    // Processamento de áudio
    if (messageType === "audioMessage") {
      const base64 = await getMediaBase64(messageObj);
      if (!base64) return NextResponse.json({ response: "Não consegui processar o áudio. Pode digitar?" });
      message = await transcribeAudio(base64);
      if (!message) return NextResponse.json({ response: "Não entendi o áudio. Pode repetir digitando?" });
    }

    // Processamento de imagem
    if (messageType === "imageMessage") {
      const base64 = await getMediaBase64(messageObj);
      if (!base64) return NextResponse.json({ response: "Não consegui ler a imagem." });
      const imageInfo = await extractImageInfo(base64);
      message = `[Imagem recebida] ${imageInfo}`;
    }

    if (!message.trim()) {
      return NextResponse.json({ response: "Não entendi a mensagem." });
    }

    const user = await getDefaultUser();
    const today = new Date().toISOString().slice(0, 10);

    // ── SESSÃO PENDENTE ─────────────────────────────────────────────
    const pending = await getPendingSession(phone);

    if (pending) {
      if (isConfirmation(message)) {
        // Executa ação confirmada
        try {
          const response = await executeAction(
            pending.action,
            pending.data,
            pending.enriched ?? {},
            user.id,
          );
          await updateEventStatus(pending.id, "executed", response);
          return NextResponse.json({ response, action: pending.action, confirmed: true });
        } catch (err) {
          const errMsg = String(err);
          await updateEventStatus(pending.id, "failed", undefined, errMsg);
          return NextResponse.json({ response: "Erro ao executar. Tente novamente." });
        }
      }

      if (isCancellation(message)) {
        await updateEventStatus(pending.id, "cancelled", "Cancelado pelo usuário");
        return NextResponse.json({ response: "Ok, cancelei. 👍 No que mais posso ajudar?", action: "cancel" });
      }

      // Mensagem não é confirmação nem cancelamento — cancela pendência e processa como nova
      await cancelPendingSession(phone);
    }

    // ── NOVA MENSAGEM ───────────────────────────────────────────────

    // Carrega contexto mínimo para Claude
    const [clients, pendingTasks] = await Promise.all([
      prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.todoTask.findMany({
        where: { userId: user.id, status: "pending" },
        orderBy: { dueDate: "asc" },
        take: 20,
        include: { client: { select: { name: true } } },
      }),
    ]);

    const clientList = clients.map(c => c.name).join(", ");
    const taskSummary = pendingTasks.length > 0
      ? `${pendingTasks.length} pendentes. Próximas: ${pendingTasks.slice(0, 3).map(t => t.title).join(", ")}`
      : "Nenhuma";

    // Classifica intenção com Claude
    let classification: ClassificationResult;
    try {
      classification = await classifyIntent(message, clientList, taskSummary, today);
    } catch {
      await prisma.whatsAppEvent.create({
        data: { phone, rawContent: message, messageType, status: "failed", errorMessage: "Falha na classificação Claude", userId: user.id },
      });
      return NextResponse.json({ response: "Não consegui entender. Tente de novo com outras palavras." });
    }

    const { action, data, response: directResponse } = classification;

    // ── QUERIES DIRETAS (sem confirmação) ──────────────────────────
    const directActions: Intent[] = ["list_tasks", "day_summary", "query_pending", "mark_paid", "unknown"];

    if (directActions.includes(action)) {
      let response: string;

      if (action === "mark_paid" || action === "unknown") {
        if (action === "mark_paid") {
          try {
            response = await executeAction(action, data, {}, user.id);
          } catch {
            response = directResponse || "Não consegui processar.";
          }
        } else {
          response = directResponse || "Não entendi. Pode reformular?";
        }
      } else {
        response = await executeQuery(action, data, user.id, { pendingTasks, today });
      }

      await prisma.whatsAppEvent.create({
        data: {
          phone, rawContent: message, messageType,
          interpretedIntent: action,
          extractedData: data as object,
          status: "executed",
          response,
          userId: user.id,
        },
      });

      return NextResponse.json({ response, action });
    }

    // ── AÇÕES COM CONFIRMAÇÃO (create_task, register_payment, create_expense) ──
    const enrichResult = await enrichBeforeConfirm(action, data, user.id);

    // Se enrich retornou mensagem direta (ambiguidade, não encontrado sem vínculo)
    if (!enrichResult.valid) {
      await prisma.whatsAppEvent.create({
        data: {
          phone, rawContent: message, messageType,
          interpretedIntent: action,
          status: "failed",
          response: enrichResult.message,
          userId: user.id,
        },
      });
      return NextResponse.json({ response: enrichResult.message, action });
    }

    const confirmationMsg = buildConfirmationMessage(action, data, enrichResult.enriched ?? {});

    // Salva evento com status waiting_confirmation e dados para execução posterior
    const event = await prisma.whatsAppEvent.create({
      data: {
        phone, rawContent: message, messageType,
        interpretedIntent: action,
        extractedData: { action, data, enriched: enrichResult.enriched } as object,
        status: "waiting_confirmation",
        userId: user.id,
      },
    });

    return NextResponse.json({
      response: confirmationMsg,
      action,
      pendingEventId: event.id,
      waitingConfirmation: true,
    });

  } catch (err) {
    console.error("[POST /api/whatsapp]", err);
    return NextResponse.json({ response: "Erro interno. Tente novamente." }, { status: 500 });
  }
}

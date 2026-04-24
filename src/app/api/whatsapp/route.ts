import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const WHATSAPP_SECRET = process.env.WHATSAPP_SECRET;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function getMediaBase64(messageData: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: { "apikey": EVOLUTION_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageData, convertToMp4: false }),
    });
    const data = await res.json();
    console.log("[getMediaBase64] response:", JSON.stringify(data).slice(0, 200));
    return data.base64 || null;
  } catch (err) {
    console.error("[getMediaBase64] error:", err);
    return null;
  }
}

async function transcribeAudio(base64: string): Promise<string> {
  // Remove data URL prefix se existir
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
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        },
        {
          type: "text",
          text: "Analise esta imagem. Se for um comprovante de pagamento, extraia: valor, data, nome/descrição, forma de pagamento. Se for outra coisa, descreva o que é. Responda em português, de forma curta e direta.",
        },
      ],
    }],
  });
  return (res.content[0] as { type: string; text: string }).text;
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-whatsapp-secret");
    if (WHATSAPP_SECRET && secret !== WHATSAPP_SECRET) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const phone: string = body.phone || body.from || "";
    const messageType: string = body.messageType || "text";
    const messageObj: Record<string, unknown> = body.messageObj || {};

    let message: string = body.message || body.text || "";

    // Processa áudio
    if (messageType === "audioMessage") {
      const base64 = await getMediaBase64(messageObj);
      if (!base64) return NextResponse.json({ response: `[DEBUG áudio] messageObj recebido: ${JSON.stringify(messageObj).slice(0, 300)}` });
      message = await transcribeAudio(base64);
      if (!message) return NextResponse.json({ response: "Não entendi o áudio. Pode repetir digitando?" });
    }

    // Processa imagem
    if (messageType === "imageMessage") {
      const base64 = await getMediaBase64(messageObj);
      if (!base64) return NextResponse.json({ response: `[DEBUG imagem] messageObj recebido: ${JSON.stringify(messageObj).slice(0, 300)}` });
      const imageInfo = await extractImageInfo(base64);
      message = `[Imagem recebida] ${imageInfo}`;
    }

    if (!message) return NextResponse.json({ response: "Não entendi a mensagem." });

    const user = await getDefaultUser();
    const today = new Date().toISOString().slice(0, 10);

    const [clients, pendingTasks, pendingFinancial] = await Promise.all([
      prisma.client.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
      prisma.todoTask.findMany({
        where: { userId: user.id, status: "pending" },
        orderBy: { dueDate: "asc" },
        take: 20,
        include: { client: { select: { name: true } } },
      }),
      prisma.financialTx.findMany({
        where: { status: "pendente" },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
    ]);

    const clientList = clients.map(c => `${c.name} (id: ${c.id})`).join(", ");
    const taskList = pendingTasks.map(t =>
      `- ${t.title}${t.dueDate ? ` (vence: ${t.dueDate.toISOString().slice(0, 10)})` : ""}${t.client ? ` [${t.client.name}]` : ""}`
    ).join("\n");
    const financialList = pendingFinancial.map(f =>
      `- ${f.description}: R$${f.amount}${f.dueDate ? ` (vence: ${f.dueDate.toISOString().slice(0, 10)})` : ""}`
    ).join("\n");

    const systemPrompt = `Você é o assistente operacional do Fernando Gomes, consultor de fitness.
Hoje é ${today}.

ALUNOS/CLIENTES CADASTRADOS:
${clientList || "Nenhum cadastrado"}

TAREFAS PENDENTES:
${taskList || "Nenhuma"}

FINANCEIRO PENDENTE:
${financialList || "Nenhum"}

Analise a mensagem e retorne APENAS um JSON válido (sem markdown) com esta estrutura:
{
  "action": "create_task" | "list_tasks" | "day_summary" | "create_expense" | "mark_paid" | "pending_financial" | "unknown",
  "data": { ... campos conforme a action ... },
  "response": "mensagem amigável para responder no WhatsApp"
}

AÇÕES E CAMPOS:
- create_task: { "title": string, "description"?: string, "dueDate"?: "YYYY-MM-DD", "type": "general"|"student"|"financial"|"content"|"administrative", "clientId"?: string }
- list_tasks: {} (lista as tarefas pendentes)
- day_summary: {} (resumo do dia)
- create_expense: { "description": string, "amount": number, "category": "Pessoal"|"Ferramentas e Plataformas"|"Marketing"|"Impostos"|"Outros", "dueDate"?: "YYYY-MM-DD" }
- mark_paid: { "description": string } (marca pagamento como recebido pelo nome)
- pending_financial: {} (lista pendências financeiras)
- unknown: {} (quando não entender)

REGRAS CRÍTICAS:
- NUNCA invente, altere ou substitua nomes mencionados na mensagem. Use EXATAMENTE o nome que está escrito.
- NUNCA complete ou corrija nomes — se a pessoa escreveu "Marla Knod", use "Marla Knod", não invente outro nome.
- Entenda datas naturais: "hoje", "amanhã", "sexta", etc. Converta para YYYY-MM-DD.
- Se mencionar nome de aluno cadastrado, tente vincular ao clientId correto comparando com a lista acima.
- Seja direto e amigável, use emojis com moderação.
- Confirme a ação na response mostrando exatamente o que vai salvar.`;

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: message }],
      system: systemPrompt,
    });

    const raw = (aiResponse.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ response: "Não consegui processar sua mensagem. Tente de novo." });

    const parsed = JSON.parse(jsonMatch[0]);
    const { action, data } = parsed;
    let finalResponse = parsed.response;

    if (action === "create_task") {
      await prisma.todoTask.create({
        data: {
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          type: data.type || "general",
          source: "whatsapp",
          status: "pending",
          userId: user.id,
          clientId: data.clientId || null,
        },
      });
    }

    if (action === "create_expense") {
      await prisma.financialTx.create({
        data: {
          type: "despesa",
          description: data.description,
          amount: data.amount,
          category: data.category || "Outros",
          status: "pendente",
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
      });
    }

    if (action === "mark_paid") {
      const tx = await prisma.financialTx.findFirst({
        where: { status: "pendente", description: { contains: data.description, mode: "insensitive" } },
      });
      if (tx) {
        await prisma.financialTx.update({ where: { id: tx.id }, data: { status: "pago", paidAt: new Date() } });
        finalResponse = `✅ Pagamento de *${tx.description}* (R$${tx.amount}) marcado como recebido!`;
      } else {
        finalResponse = `Não encontrei nenhum lançamento pendente com esse nome.`;
      }
    }

    if (action === "list_tasks") {
      finalResponse = pendingTasks.length === 0
        ? "Você não tem tarefas pendentes! 🎉"
        : `📋 *Tarefas pendentes (${pendingTasks.length}):*\n${taskList}`;
    }

    if (action === "pending_financial") {
      finalResponse = pendingFinancial.length === 0
        ? "Nenhuma pendência financeira! 💰"
        : `💰 *Pendências financeiras:*\n${financialList}`;
    }

    if (action === "day_summary") {
      const todayTasks = pendingTasks.filter(t => t.dueDate && t.dueDate.toISOString().slice(0, 10) === today);
      const overdue = pendingTasks.filter(t => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today);
      finalResponse = `☀️ *Resumo do dia (${today}):*\n\n` +
        `📋 Tarefas para hoje: ${todayTasks.length}\n` +
        (todayTasks.map(t => `  • ${t.title}`).join("\n") || "") +
        (overdue.length > 0 ? `\n\n⚠️ Atrasadas: ${overdue.length}\n${overdue.map(t => `  • ${t.title}`).join("\n")}` : "") +
        `\n\n💰 Pendências financeiras: ${pendingFinancial.length}`;
    }

    return NextResponse.json({ response: finalResponse, action });
  } catch (err) {
    console.error("[POST /api/whatsapp]", err);
    return NextResponse.json({ response: "Erro interno. Tente novamente." }, { status: 500 });
  }
}

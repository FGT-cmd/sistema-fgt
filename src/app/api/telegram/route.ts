/**
 * Webhook do Telegram Bot.
 *
 * Para configurar:
 * 1. Crie um bot via @BotFather no Telegram → obtenha TELEGRAM_BOT_TOKEN
 * 2. Adicione ao .env: TELEGRAM_BOT_TOKEN=... e TELEGRAM_ALLOWED_CHAT=<seu chat_id>
 * 3. Configure o webhook:
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SUA_URL>/api/telegram"
 *
 * Para descobrir seu chat_id: envie /start para o bot e veja os logs do servidor.
 */

import { NextRequest, NextResponse } from "next/server";
import { processOpenClawMessage } from "@/lib/openclaw/engine";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = process.env.TELEGRAM_ALLOWED_CHAT;

async function sendTelegramMessage(chatId: string, text: string) {
  if (!BOT_TOKEN) {
    console.log(`[Telegram] BOT_TOKEN não configurado. Resposta seria:\n${text}`);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (err) {
    console.error("[Telegram] Erro ao enviar mensagem:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message = update.message || update.edited_message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId   = String(message.chat.id);
    const text: string = message.text;

    console.log("[telegram] received", chatId, text);

    // ── 1. Criar evento imediatamente ──────────────────────────────
    const user = await getDefaultUser();
    const initialEvent = await prisma.openClawEvent.create({
      data: {
        chatId,
        source: "telegram",
        rawCommand: text,
        interpretedIntent: "received",
        executionStatus: "received",
        response: null,
        errorMessage: null,
        userId: user.id,
      },
    });
    const eventId = initialEvent.id;
    console.log("[telegram] event created", eventId);

    // ── 2. Chat bloqueado ──────────────────────────────────────────
    if (ALLOWED_CHAT && chatId !== ALLOWED_CHAT) {
      console.log(`[Telegram] Chat ${chatId} não autorizado.`);
      await prisma.openClawEvent.update({
        where: { id: eventId },
        data: { executionStatus: "blocked", errorMessage: "Chat não autorizado" },
      });
      return NextResponse.json({ ok: true });
    }

    // ── 3. Processar via engine ────────────────────────────────────
    let result;
    try {
      result = await processOpenClawMessage({ chatId, message: text, source: "telegram", existingEventId: eventId });
      console.log(`[Telegram] Engine result: intent=${result.intent} status=${result.status} eventId=${result.eventId ?? "NONE"}`);
    } catch (err) {
      console.error("[POST /api/telegram] Falha no engine:", err);
      const fallbackResponse = "Sistema operacional indisponível no momento. Tente novamente em instantes.";
      await prisma.openClawEvent.update({
        where: { id: eventId },
        data: { executionStatus: "failed", errorMessage: String(err), response: fallbackResponse },
      });
      await sendTelegramMessage(chatId, fallbackResponse);
      return NextResponse.json({ ok: true });
    }

    // ── 4. Se engine retornou eventId diferente (fluxo confirmação)
    //       atualizar o evento inicial com o status final.
    if (result.eventId !== eventId) {
      try {
        await prisma.openClawEvent.update({
          where: { id: eventId },
          data: {
            interpretedIntent: result.intent,
            executionStatus: result.status,
            response: result.response,
          },
        });
      } catch (updateErr) {
        console.error("[Telegram] Falha ao atualizar evento inicial:", updateErr);
      }
    }

    await sendTelegramMessage(chatId, result.response);
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[POST /api/telegram]", err);
    return NextResponse.json({ ok: true }); // Telegram espera 200 sempre
  }
}

export async function GET() {
  const base = {
    botConfigured: !!BOT_TOKEN,
    chatConfigured: !!ALLOWED_CHAT,
  };

  if (!BOT_TOKEN) {
    return NextResponse.json({ ...base, ok: false, error: "TELEGRAM_BOT_TOKEN não configurado" });
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const me = await meRes.json();

    const lastEvent = await prisma.openClawEvent.findFirst({
      where: { source: "telegram" },
      orderBy: { createdAt: "desc" },
      select: { rawCommand: true, createdAt: true, executionStatus: true },
    });

    return NextResponse.json({
      ...base,
      ok: me.ok,
      botUsername: me.result?.username ?? null,
      botFirstName: me.result?.first_name ?? null,
      lastEvent: lastEvent ?? null,
      error: me.ok ? undefined : me.description,
    });
  } catch {
    return NextResponse.json({ ...base, ok: false, error: "Erro ao conectar com a API do Telegram" });
  }
}

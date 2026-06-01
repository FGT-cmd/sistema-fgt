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

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT  = process.env.TELEGRAM_ALLOWED_CHAT;

async function sendTelegramMessage(chatId: string, text: string) {
  if (!BOT_TOKEN) {
    console.log(`[Telegram] BOT_TOKEN não configurado. Resposta seria:\n${text}`);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[Telegram] Erro ao enviar mensagem:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // Suporte a mensagens normais e editadas
    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text: string = message.text;

    // Log para descobrir o chat_id
    console.log(`[Telegram] Update de chatId=${chatId}: "${text}"`);

    // Whitelist: apenas o chat autorizado
    if (ALLOWED_CHAT && chatId !== ALLOWED_CHAT) {
      console.log(`[Telegram] Chat ${chatId} não autorizado.`);
      return NextResponse.json({ ok: true });
    }

    // Processa via OpenClaw engine
    let result;
    try {
      result = await processOpenClawMessage({ chatId, message: text, source: "telegram" });
    } catch (err) {
      console.error("[POST /api/telegram] Falha no engine:", err);
      const fallbackResponse = "Sistema operacional indisponível no momento. Tente novamente em instantes.";
      // Garante que falhas totais do engine ainda geram um OpenClawEvent
      try {
        const user = await getDefaultUser();
        await prisma.openClawEvent.create({
          data: {
            chatId,
            source: "telegram",
            rawCommand: text,
            executionStatus: "failed",
            errorMessage: String(err),
            response: fallbackResponse,
            userId: user.id,
          },
        });
      } catch (saveErr) {
        console.error("[POST /api/telegram] Fallback event save failed:", saveErr);
      }
      await sendTelegramMessage(chatId, fallbackResponse);
      return NextResponse.json({ ok: true });
    }

    // Envia resposta
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

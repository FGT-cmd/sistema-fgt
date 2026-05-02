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
      await sendTelegramMessage(chatId, "Sistema operacional indisponível no momento. Tente novamente em instantes.");
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

// Endpoint de verificação do webhook (GET)
export async function GET() {
  return NextResponse.json({
    status: "Telegram webhook ativo",
    botConfigured: !!BOT_TOKEN,
    chatConfigured: !!ALLOWED_CHAT,
    configSteps: !BOT_TOKEN ? [
      "1. Crie um bot via @BotFather no Telegram",
      "2. Adicione TELEGRAM_BOT_TOKEN ao .env",
      "3. Adicione TELEGRAM_ALLOWED_CHAT ao .env (seu chat_id)",
      "4. Configure o webhook: curl 'https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/api/telegram'",
    ] : ["Bot configurado! ✅"],
  });
}

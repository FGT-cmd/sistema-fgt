/**
 * Webhook do Telegram Bot.
 *
 * Para configurar:
 * 1. Crie um bot via @BotFather no Telegram → obtenha TELEGRAM_BOT_TOKEN
 * 2. Adicione ao .env: TELEGRAM_BOT_TOKEN=... e TELEGRAM_ALLOWED_CHAT=<seu chat_id>
 * 3. Configure o webhook:
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SUA_URL>/api/telegram"
 *
 * Responde 200 na hora e processa em after(): extrato e foto levam dezenas de
 * segundos, e o Telegram reenvia o update se o webhook demorar.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { processOpenClawMessage } from "@/lib/openclaw/engine";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { answerCallbackQuery, downloadTelegramFile, sendTelegramMessage } from "@/lib/telegram";
import { captureImage, captureText } from "@/lib/financeiro/capture/run";
import { captureStatementFile } from "@/lib/financeiro/capture/statementCapture";
import { takeCorrection } from "@/lib/financeiro/capture/apply";
import { handleFinanceCallback } from "@/lib/financeiro/capture/callbacks";
import { buildCaptureButtons, parseFinanceCallback } from "@/lib/financeiro/capture/telegramUi";
import type { ImageMime } from "@/lib/financeiro/capture/interpret";

export const maxDuration = 300;

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = process.env.TELEGRAM_ALLOWED_CHAT;
const IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

type TgPhoto = { file_id: string };
type TgDocument = { file_id: string; file_name?: string; mime_type?: string };
type TgMessage = {
  chat: { id: number | string };
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  document?: TgDocument;
};
type TgCallback = { id: string; data?: string; message?: { chat: { id: number | string } } };

const allowed = (chatId: string) => !ALLOWED_CHAT || chatId === ALLOWED_CHAT;

async function processTextInner(chatId: string, text: string, ref: { eventId?: string }): Promise<void> {
  console.log("[telegram] received", chatId, text);

  // ── 1. Criar evento imediatamente ──────────────────────────────
  const user = await getDefaultUser();
  const initialEvent = await prisma.openClawEvent.create({
    data: {
      chatId, source: "telegram", rawCommand: text, interpretedIntent: "received",
      executionStatus: "received", response: null, errorMessage: null, userId: user.id,
    },
  });
  const eventId = initialEvent.id;
  ref.eventId = eventId;

  // ── 2. Chat bloqueado ──────────────────────────────────────────
  if (!allowed(chatId)) {
    await prisma.openClawEvent.update({
      where: { id: eventId },
      data: { executionStatus: "blocked", errorMessage: "Chat não autorizado" },
    });
    return;
  }

  // ── 3. Correção de comprovante pendente ────────────────────────
  const correction = await takeCorrection();
  if (correction) {
    let r;
    try {
      r = await captureText(
        `Lançamento de um comprovante que eu tinha entendido assim: ${correction}. Correção do Fernando: ${text}`,
        "telegram",
      );
    } catch (err) {
      console.error("[telegram] correction", err);
      const msg = "Não consegui registrar a correção agora. Me manda de novo o lançamento certo em texto.";
      await prisma.openClawEvent.update({
        where: { id: eventId },
        data: { interpretedIntent: "finance_capture", executionStatus: "failed", errorMessage: String(err), response: msg },
      }).catch(() => {});
      await sendTelegramMessage(chatId, msg);
      return;
    }
    await prisma.openClawEvent.update({
      where: { id: eventId },
      data: { interpretedIntent: "finance_capture", executionStatus: "executed", response: r.summary },
    });
    await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
    return;
  }

  // ── 4. Processar via engine ────────────────────────────────────
  let result;
  try {
    result = await processOpenClawMessage({ chatId, message: text, source: "telegram", existingEventId: eventId });
  } catch (err) {
    console.error("[POST /api/telegram] Falha no engine:", err);
    const fallbackResponse = "Sistema operacional indisponível no momento. Tente novamente em instantes.";
    await prisma.openClawEvent.update({
      where: { id: eventId },
      data: { executionStatus: "failed", errorMessage: String(err), response: fallbackResponse },
    });
    await sendTelegramMessage(chatId, fallbackResponse);
    return;
  }

  // ── 5. Se engine retornou eventId diferente (fluxo confirmação)
  if (result.eventId !== eventId) {
    try {
      await prisma.openClawEvent.update({
        where: { id: eventId },
        data: { interpretedIntent: result.intent, executionStatus: result.status, response: result.response },
      });
    } catch (updateErr) {
      console.error("[Telegram] Falha ao atualizar evento inicial:", updateErr);
    }
  }

  await sendTelegramMessage(chatId, result.response, { buttons: result.buttons });
}

async function processText(chatId: string, text: string): Promise<void> {
  const ref: { eventId?: string } = {};
  try {
    await processTextInner(chatId, text, ref);
  } catch (err) {
    console.error("[telegram] text", err);
    const msg = "Sistema operacional indisponível no momento. Tente novamente em instantes.";
    if (ref.eventId) {
      try {
        await prisma.openClawEvent.update({
          where: { id: ref.eventId },
          data: { executionStatus: "failed", errorMessage: String(err), response: msg },
        });
      } catch { /* best effort */ }
    }
    await sendTelegramMessage(chatId, msg);
  }
}

async function processMedia(chatId: string, message: TgMessage): Promise<void> {
  try {
    if (message.photo?.length) {
      const best = message.photo[message.photo.length - 1];
      const file = await downloadTelegramFile(best.file_id);
      if (!file) throw new Error("download falhou");
      const r = await captureImage(file.base64, "image/jpeg", message.caption ?? null, "telegram");
      await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
      return;
    }
    const doc = message.document!;
    const mime = doc.mime_type ?? "";
    const file = await downloadTelegramFile(doc.file_id);
    if (!file) throw new Error("download falhou");
    if ((IMAGE_MIMES as string[]).includes(mime)) {
      const r = await captureImage(file.base64, mime as ImageMime, message.caption ?? null, "telegram");
      await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
      return;
    }
    await sendTelegramMessage(chatId, "⏳ Lendo o extrato…");
    const r = await captureStatementFile({ fileBase64: file.base64, fileName: doc.file_name ?? "extrato", mimeType: mime });
    await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
  } catch (err) {
    console.error("[telegram] media", err);
    await sendTelegramMessage(chatId, "Não consegui processar esse arquivo agora. Tenta de novo em instantes.");
  }
}

async function processCallback(chatId: string, data: string): Promise<void> {
  const cb = parseFinanceCallback(data);
  if (!cb) return;
  try {
    const { text, buttons } = await handleFinanceCallback(cb);
    await sendTelegramMessage(chatId, text, { buttons });
  } catch (err) {
    console.error("[telegram] callback", err);
    await sendTelegramMessage(chatId, "Falha ao executar essa ação. Tenta de novo.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const callback = update.callback_query as TgCallback | undefined;
    if (callback) {
      const chatId = String(callback.message?.chat.id ?? "");
      await answerCallbackQuery(callback.id);
      if (chatId && allowed(chatId) && callback.data) {
        after(() => processCallback(chatId, callback.data!));
      }
      return NextResponse.json({ ok: true });
    }

    const message = (update.message || update.edited_message) as TgMessage | undefined;
    if (!message) return NextResponse.json({ ok: true });
    const chatId = String(message.chat.id);

    if (message.photo?.length || message.document) {
      if (allowed(chatId)) after(() => processMedia(chatId, message));
      return NextResponse.json({ ok: true });
    }

    if (message.text) {
      const text = message.text;
      after(() => processText(chatId, text));
    }
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

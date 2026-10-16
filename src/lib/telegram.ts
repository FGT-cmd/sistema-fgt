/**
 * Envio de mensagem pro Telegram — usado pelo webhook (resposta a comando)
 * e pelos crons do Jarvis (mensagem proativa, sem comando do usuário).
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export type TelegramButton = { text: string; callback_data: string };

async function postMessage(body: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts: { buttons?: TelegramButton[][] } = {},
): Promise<void> {
  if (!BOT_TOKEN) {
    console.log(`[Telegram] BOT_TOKEN não configurado. Resposta seria:\n${text}`);
    return;
  }
  const base: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.buttons?.length) base.reply_markup = { inline_keyboard: opts.buttons };
  try {
    const res = await postMessage({ ...base, parse_mode: "Markdown" });
    // Texto do usuário com "_" ou "*" quebra o Markdown do Telegram (400):
    // reenviar sem formatação em vez de perder a mensagem.
    if (res.status === 400) await postMessage(base);
  } catch (err) {
    console.error("[Telegram] Erro ao enviar mensagem:", err);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
    });
  } catch (err) {
    console.error("[Telegram] Erro em answerCallbackQuery:", err);
  }
}

export async function downloadTelegramFile(fileId: string): Promise<{ base64: string; filePath: string } | null> {
  if (!BOT_TOKEN) return null;
  const meta = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = json.result?.file_path;
  if (!json.ok || !filePath) return null;
  const file = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
  if (!file.ok) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  return { base64: buf.toString("base64"), filePath };
}

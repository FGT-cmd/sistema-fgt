// Autenticação do webhook do Telegram. Pura (sem Next/Prisma) para ser testável.

import { timingSafeEqual } from "node:crypto";

// Fail closed: sem TELEGRAM_ALLOWED_CHAT configurado, ninguém é atendido.
export function isAllowedChat(chatId: string, allowedChat: string | undefined): boolean {
  return !!allowedChat && chatId === allowedChat;
}

// Header x-telegram-bot-api-secret-token, comparado em tempo constante.
export function secretTokenMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

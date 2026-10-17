/**
 * Gatilhos proativos do Jarvis — chamado pelos Vercel Cron Jobs (ver vercel.json).
 * Reaproveita getDailyPendingSummary (mesma lógica usada pelo comando "hoje"/
 * "atrasadas" no bot), só muda o enquadramento da mensagem por horário.
 *
 * Autenticação: Vercel manda Authorization: Bearer <CRON_SECRET> automaticamente
 * quando o próprio cron dispara a chamada — não usa Basic Auth (por isso essa
 * rota está liberada em proxy.ts, igual /api/op/*).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDailyPendingSummary } from "@/lib/openclaw/actions";
import { sendTelegramMessage } from "@/lib/telegram";
import { runTickTickSync } from "@/lib/ticktick/syncRunner";
import { getDefaultUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { generateRecurringForMonth } from "@/lib/financeiro/recurringRunner";
import { buildMonthlyMessage } from "@/lib/financeiro/recurring";
import { todaySaoPaulo } from "@/lib/financeiro/dates";
import type { OCQueryType } from "@/lib/openclaw/types";

type Slot = "morning" | "afternoon" | "evening" | "weekly" | "monthly";
const VALID_SLOTS: Slot[] = ["morning", "afternoon", "evening", "weekly", "monthly"];

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // fail-closed: sem CRON_SECRET configurado, nunca libera
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function frame(slot: Slot, body: string): string {
  const headers: Record<Slot, string> = {
    morning: "☀️ *Bom dia!*",
    afternoon: "🕑 *Check do meio do dia*",
    evening: "🌙 *Fechamento do dia*",
    weekly: "🗓️ *Revisão semanal*",
    monthly: "🗓️ *Virada do mês*",
  };
  return `${headers[slot]}\n\n${body}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const slotParam = req.nextUrl.searchParams.get("slot");
  if (!slotParam || !VALID_SLOTS.includes(slotParam as Slot)) {
    return NextResponse.json({ ok: false, message: "slot inválido" }, { status: 400 });
  }
  const slot = slotParam as Slot;

  const chatId = process.env.TELEGRAM_ALLOWED_CHAT?.trim();
  if (!chatId) {
    return NextResponse.json(
      { ok: false, message: "TELEGRAM_ALLOWED_CHAT não configurado" },
      { status: 503 },
    );
  }

  try {
    const user = await getDefaultUser();
    if (slot === "morning" && process.env.TICKTICK_SYNC_ENABLED === "true") {
      await runTickTickSync().catch(err => console.error("[cron/jarvis] ticktick", err));
    }
    if (slot === "monthly") {
      const month = todaySaoPaulo().slice(0, 7);
      const created = await generateRecurringForMonth(user.id, month);
      const reviewCount = await prisma.financialTx.count({ where: { needsReview: true } });
      await sendTelegramMessage(chatId, buildMonthlyMessage({ month, created, reviewCount }));
      return NextResponse.json({ ok: true, slot, created: created.length });
    }
    const queryType: OCQueryType = slot === "weekly" ? "overdue" : "today";
    const body = await getDailyPendingSummary(user.id, queryType);
    await sendTelegramMessage(chatId, frame(slot, body));
    return NextResponse.json({ ok: true, slot });
  } catch (err) {
    console.error("[cron/jarvis]", slot, err);
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 });
  }
}

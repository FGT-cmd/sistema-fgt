/**
 * Integração somente leitura com Google Calendar API (uso operacional / Telegram).
 * Reutiliza OAuth do usuário padrão (tokens em User, ver google-calendar.ts).
 */

import { getValidAccessToken, type GoogleEvent } from "@/lib/google-calendar";

const TIME_ZONE = "America/Sao_Paulo";
/** Deslocamento fixo de São Paulo (sem horário de verão desde 2019). */
const SP_UTC_OFFSET_HOURS = 3;

export type OpCalendarRange = "today" | "tomorrow" | "tomorrow_morning";

type Ymd = { y: number; m: number; d: number };

function ymdInTimeZone(d: Date, timeZone: string): Ymd {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, dom] = s.split("-").map((x) => Number.parseInt(x, 10));
  return { y, m, d: dom };
}

/** Instante UTC correspondente a um horário de parede em SP (offset fixo -03). */
function spWallToUtc(y: number, m: number, d: number, h: number, min: number, s: number, ms: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h + SP_UTC_OFFSET_HOURS, min, s, ms));
}

function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const noon = spWallToUtc(ymd.y, ymd.m, ymd.d, 12, 0, 0, 0);
  const later = new Date(noon.getTime() + days * 86_400_000);
  return ymdInTimeZone(later, TIME_ZONE);
}

function formatYmdBr(ymd: Ymd): string {
  return `${String(ymd.d).padStart(2, "0")}/${String(ymd.m).padStart(2, "0")}/${ymd.y}`;
}

export type OperationalTimeWindow = {
  timeMin: string;
  timeMax: string;
  /** Rótulo curto para o texto final (ex.: "Hoje (03/05/2026)"). */
  label: string;
};

/**
 * Converte faixa operacional em janela RFC3339 para a API (calendário do usuário em SP).
 */
export function resolveOperationalRange(
  range: OpCalendarRange,
  now: Date = new Date(),
): OperationalTimeWindow {
  const todayYmd = ymdInTimeZone(now, TIME_ZONE);

  if (range === "today") {
    const start = spWallToUtc(todayYmd.y, todayYmd.m, todayYmd.d, 0, 0, 0, 0);
    const dayAfter = addDaysYmd(todayYmd, 1);
    const endExclusive = spWallToUtc(dayAfter.y, dayAfter.m, dayAfter.d, 0, 0, 0, 0);
    return {
      timeMin: start.toISOString(),
      timeMax: endExclusive.toISOString(),
      label: `Hoje (${formatYmdBr(todayYmd)})`,
    };
  }

  const tomorrowYmd = addDaysYmd(todayYmd, 1);

  if (range === "tomorrow") {
    const start = spWallToUtc(tomorrowYmd.y, tomorrowYmd.m, tomorrowYmd.d, 0, 0, 0, 0);
    const dayAfterTomorrow = addDaysYmd(tomorrowYmd, 1);
    const endExclusive = spWallToUtc(
      dayAfterTomorrow.y,
      dayAfterTomorrow.m,
      dayAfterTomorrow.d,
      0,
      0,
      0,
      0,
    );
    return {
      timeMin: start.toISOString(),
      timeMax: endExclusive.toISOString(),
      label: `Amanhã (${formatYmdBr(tomorrowYmd)})`,
    };
  }

  // tomorrow_morning: início do dia até 12h (timeMax exclusivo = meio-dia em SP, conforme API)
  const start = spWallToUtc(tomorrowYmd.y, tomorrowYmd.m, tomorrowYmd.d, 0, 0, 0, 0);
  const endExclusive = spWallToUtc(tomorrowYmd.y, tomorrowYmd.m, tomorrowYmd.d, 12, 0, 0, 0);
  return {
    timeMin: start.toISOString(),
    timeMax: endExclusive.toISOString(),
    label: `Amanhã de manhã até 12h (${formatYmdBr(tomorrowYmd)})`,
  };
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";

export type ListEventsResult =
  | { ok: true; events: GoogleEvent[] }
  | { ok: false; message: string };

/**
 * Lista eventos do calendário configurado, com erro explícito (não silencia falha HTTP).
 */
export async function listCalendarEventsReadonly(
  timeMin: string,
  timeMax: string,
): Promise<ListEventsResult> {
  const token = await getValidAccessToken();
  if (!token) {
    return {
      ok: false,
      message:
        "Google Agenda não está conectada. Conecte em Configurações / Agenda no sistema e tente de novo.",
    };
  }

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: TIME_ZONE,
  });

  const encId = encodeURIComponent(CALENDAR_ID);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encId}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      message: `Não foi possível ler a Google Agenda (${res.status}): ${detail}`,
    };
  }

  const data = (await res.json()) as { items?: GoogleEvent[] };
  return { ok: true, events: data.items ?? [] };
}

function eventStart(ev: GoogleEvent): Date | null {
  if (ev.start?.dateTime) return new Date(ev.start.dateTime);
  if (ev.start?.date) return new Date(`${ev.start.date}T00:00:00-03:00`);
  return null;
}

function formatEventLine(ev: GoogleEvent, index: number): string {
  const summary = (ev.summary ?? "(sem título)").trim() || "(sem título)";
  const start = eventStart(ev);

  if (ev.start?.date && !ev.start?.dateTime) {
    return `${index + 1}. Dia inteiro — ${summary}`;
  }

  if (start && !Number.isNaN(start.getTime())) {
    const time = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(start);
    return `${index + 1}. ${time} — ${summary}`;
  }

  return `${index + 1}. — ${summary}`;
}

/**
 * Texto curto pronto para Telegram com agenda do período.
 */
export function formatEventsAsTelegramText(label: string, events: GoogleEvent[]): string {
  if (events.length === 0) {
    return `📅 ${label}\n\nNenhum evento neste período.`;
  }

  const lines = events.map((ev, i) => formatEventLine(ev, i));
  return `📅 ${label}\n\n${lines.join("\n")}`;
}

export function isOpCalendarRange(v: string): v is OpCalendarRange {
  return v === "today" || v === "tomorrow" || v === "tomorrow_morning";
}

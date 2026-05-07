import { listCalendarEvents, type GoogleEvent } from "@/lib/google-calendar";

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitle(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q)) return 0.95;
  if (q.includes(c)) return 0.9;

  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  const common = qTokens.filter((t) => cTokens.includes(t)).length;
  return qTokens.length ? common / qTokens.length : 0;
}

export type ResolveEventResult =
  | { ok: true; event: GoogleEvent; durationMs: number }
  | { ok: false; reason: "not_found" | "ambiguous"; text: string };

function eventDurationMs(ev: GoogleEvent): number {
  const startRaw = ev.start?.dateTime;
  const endRaw = ev.end?.dateTime;
  if (!startRaw || !endRaw) return 60 * 60 * 1000;
  const start = new Date(startRaw).getTime();
  const end = new Date(endRaw).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 60 * 60 * 1000;
  return end - start;
}

export async function resolveEventByTitleForUpdate(
  queryTitle: string,
): Promise<ResolveEventResult> {
  const now = Date.now();
  const from = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString();

  const events = await listCalendarEvents(from, to, {
    strictRefreshErrors: true,
    exposeCalendarApiErrors: true,
  });
  if (!events) {
    return {
      ok: false,
      reason: "not_found",
      text: "Agenda: Google Agenda não está conectada. Conecte em Configurações / Agenda no sistema e tente de novo.",
    };
  }

  const ranked = events
    .map((event) => ({ event, score: scoreTitle(queryTitle, event.summary ?? "") }))
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      ok: false,
      reason: "not_found",
      text: `Não encontrei evento compatível com "${queryTitle}".`,
    };
  }

  const best = ranked[0];
  const second = ranked[1];
  if (second && best.score - second.score < 0.08) {
    return {
      ok: false,
      reason: "ambiguous",
      text: `Ambiguidade ao localizar evento "${queryTitle}". Possíveis: "${best.event.summary}" e "${second.event.summary}".`,
    };
  }

  return {
    ok: true,
    event: best.event,
    durationMs: eventDurationMs(best.event),
  };
}

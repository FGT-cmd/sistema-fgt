export const OP_CAL_UPDATE_TZ = "America/Sao_Paulo";

type Ymd = { y: number; m: number; d: number };

function ymdInSaoPaulo(d: Date): Ymd {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: OP_CAL_UPDATE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, dom] = s.split("-").map((x) => Number.parseInt(x, 10));
  return { y, m, d: dom };
}

function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const utcMidday = Date.UTC(ymd.y, ymd.m - 1, ymd.d, 15, 0, 0);
  const later = new Date(utcMidday + days * 86_400_000);
  return ymdInSaoPaulo(later);
}

function weekdaySun0InSaoPaulo(ymd: Ymd): number {
  const inst = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 15, 0, 0));
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: OP_CAL_UPDATE_TZ,
    weekday: "short",
  }).format(inst);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

function nextYmdForWeekday(targetDow: number): Ymd {
  const today = ymdInSaoPaulo(new Date());
  for (let add = 0; add < 7; add += 1) {
    const ymd = addDaysYmd(today, add);
    if (weekdaySun0InSaoPaulo(ymd) === targetDow) return ymd;
  }
  return today;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toRfc3339Minus3(ymd: Ymd, hour: number, minute: number): string {
  return `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}T${pad2(hour)}:${pad2(minute)}:00-03:00`;
}

type DateMatch =
  | { kind: "tomorrow"; match: string }
  | { kind: "weekday"; dow: number; match: string };

function findDate(s: string): DateMatch | null {
  const tomorrow = /\bamanh[ãa](?=\s|$|[,.;])/i.exec(s);
  if (tomorrow) return { kind: "tomorrow", match: tomorrow[0] };

  const specs: { re: RegExp; dow: number }[] = [
    { re: /\bdomingo\b/i, dow: 0 },
    { re: /\bsegunda(?:-feira)?\b/i, dow: 1 },
    { re: /\bter[cç]a(?:-feira)?\b/i, dow: 2 },
    { re: /\bquarta(?:-feira)?\b/i, dow: 3 },
    { re: /\bquinta(?:-feira)?\b/i, dow: 4 },
    { re: /\bsexta(?:-feira)?\b/i, dow: 5 },
    { re: /\bs[aá]bado\b/i, dow: 6 },
  ];
  let best: { m: RegExpExecArray; dow: number } | null = null;
  for (const spec of specs) {
    const m = spec.re.exec(s);
    if (!m) continue;
    if (!best || m.index < best.m.index) best = { m, dow: spec.dow };
  }
  if (!best) return null;
  return { kind: "weekday", dow: best.dow, match: best.m[0] };
}

function findTime(s: string): { hour: number; minute: number; match: string } | null {
  const patterns: { re: RegExp; pick: (m: RegExpExecArray) => { hour: number; minute: number } }[] = [
    {
      re: /(?:^|\s)((?:às|as)\s*(\d{1,2})(?::(\d{2}))?(?:\s*h(?:oras?)?)?)(?=\s|$|[,.;])/i,
      pick: (m) => ({
        hour: Number.parseInt(m[2] ?? "0", 10),
        minute: m[3] ? Number.parseInt(m[3], 10) : 0,
      }),
    },
    {
      re: /\b(\d{1,2}):(\d{2})\b/i,
      pick: (m) => ({
        hour: Number.parseInt(m[1] ?? "0", 10),
        minute: Number.parseInt(m[2] ?? "0", 10),
      }),
    },
    {
      re: /\b(\d{1,2})h\b/i,
      pick: (m) => ({
        hour: Number.parseInt(m[1] ?? "0", 10),
        minute: 0,
      }),
    },
  ];

  let best: { index: number; hour: number; minute: number; match: string } | null = null;
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    const t = p.pick(m);
    if (t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59) continue;
    if (!best || m.index < best.index) best = { index: m.index, hour: t.hour, minute: t.minute, match: m[0] };
  }
  if (!best) return null;
  return { hour: best.hour, minute: best.minute, match: best.match.trim() };
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cleanSearchTitle(s: string): string {
  let t = normalizeSpaces(s);
  t = t.replace(/^(?:a|o|um|uma)\s+/i, "");
  t = t.replace(/^(?:reuni[aã]o|call)\s+com\s+/i, "");
  t = t.replace(/^(?:a|o)\s+/i, "");
  return normalizeSpaces(t);
}

export type OpCalendarUpdatePreviewPayload = {
  queryTitle: string;
  start: string;
  timezone: string;
};

export type OpCalendarUpdateParseResult =
  | { ok: true; text: string; payload: OpCalendarUpdatePreviewPayload }
  | { ok: false; text: string };

export function parseOpCalendarUpdatePreview(rawText: string): OpCalendarUpdateParseResult {
  const raw = normalizeSpaces(rawText);
  if (!raw) return { ok: false, text: "Texto vazio." };

  const commandRe = /^(?:remarca|remarcar|muda|mudar|altera|alterar)\s+(.+?)\s+para\s+(.+)$/i;
  const m = commandRe.exec(raw);
  if (!m) {
    return {
      ok: false,
      text: 'Formato inválido. Ex.: "remarca a reunião com cliente para sexta às 15h".',
    };
  }

  const queryRaw = normalizeSpaces(m[1] ?? "");
  const whenRaw = normalizeSpaces(m[2] ?? "");
  const queryTitle = cleanSearchTitle(queryRaw);
  if (!queryTitle) return { ok: false, text: "Não consegui identificar o título do evento a remarca." };

  const date = findDate(whenRaw);
  if (!date) {
    return { ok: false, text: 'Não encontrei data. Use "amanhã" ou dia da semana (ex.: sexta).' };
  }
  const time = findTime(whenRaw);
  if (!time) {
    return { ok: false, text: 'Não encontrei horário. Use "às 15h" ou "às 9:30".' };
  }

  let ymd: Ymd;
  if (date.kind === "tomorrow") {
    ymd = addDaysYmd(ymdInSaoPaulo(new Date()), 1);
  } else {
    ymd = nextYmdForWeekday(date.dow);
  }

  const startIso = new Date(toRfc3339Minus3(ymd, time.hour, time.minute)).toISOString();
  return {
    ok: true,
    text: `Prévia de remarcação: "${queryTitle}" para ${new Intl.DateTimeFormat("pt-BR", {
      timeZone: OP_CAL_UPDATE_TZ,
      weekday: "long",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(startIso))}.`,
    payload: {
      queryTitle,
      start: startIso,
      timezone: OP_CAL_UPDATE_TZ,
    },
  };
}

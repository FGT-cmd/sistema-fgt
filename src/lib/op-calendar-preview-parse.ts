/**
 * Parser de linguagem simples para prévia de compromisso (operacional).
 * Timezone de referência: America/Sao_Paulo (offset fixo -03 no payload).
 */

export const OP_CAL_PREVIEW_TZ = "America/Sao_Paulo";
const DEFAULT_DURATION_MIN = 60;

type Ymd = { y: number; m: number; d: number };

function ymdInSaoPaulo(d: Date): Ymd {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
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

/** Domingo = 0 … Sábado = 6 (calendário em America/Sao_Paulo). */
function weekdaySun0InSaoPaulo(ymd: Ymd): number {
  const inst = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 15, 0, 0));
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(inst);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[w] ?? 0;
}

/** Primeiro dia a partir de hoje (inclusive) em SP que cai no weekday alvo. */
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

/** RFC3339 com offset -03:00 (sem DST em SP). */
function toRfc3339Minus3(ymd: Ymd, hour: number, minute: number): string {
  return `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}T${pad2(hour)}:${pad2(minute)}:00-03:00`;
}

export type OpCalendarCreatePayload = {
  title: string;
  start: string;
  end: string;
  timezone: string;
};

export type OpCalendarPreviewParseResult =
  | { ok: true; text: string; payload: OpCalendarCreatePayload }
  | { ok: false; text: string };

const PREFIX_RE =
  /^\s*(?:cria|criar|marcar)(?:\s+um)?\s+compromisso\s+/i;

const WEEKDAY_SPECS: { re: RegExp; dow: number; label: string }[] = [
  { re: /\bdomingo\b/i, dow: 0, label: "domingo" },
  { re: /\bsegunda(?:-feira)?\b/i, dow: 1, label: "segunda" },
  { re: /\bter[cç]a(?:-feira)?\b/i, dow: 2, label: "terça" },
  { re: /\bquarta(?:-feira)?\b/i, dow: 3, label: "quarta" },
  { re: /\bquinta(?:-feira)?\b/i, dow: 4, label: "quinta" },
  { re: /\bsexta(?:-feira)?\b/i, dow: 5, label: "sexta" },
  { re: /\bs[aá]bado\b/i, dow: 6, label: "sábado" },
];

function stripPrefix(raw: string): string {
  return raw.replace(PREFIX_RE, "").trim();
}

function findEarliestDuration(s: string): { minutes: number; match: string; index: number } | null {
  const patterns: { re: RegExp; minutes: (m: RegExpExecArray) => number }[] = [
    {
      re: /\b(\d+)\s*min(?:uto|utos)?\b/gi,
      minutes: (m) => Number.parseInt(m[1] ?? "0", 10),
    },
    {
      re: /\b([12])h\b/gi,
      minutes: (m) => Number.parseInt(m[1] ?? "0", 10) * 60,
    },
    {
      re: /\b(\d+)\s*h(?:ora|oras)\b/gi,
      minutes: (m) => Number.parseInt(m[1] ?? "0", 10) * 60,
    },
  ];

  let best: { minutes: number; match: string; index: number } | null = null;

  for (const { re, minutes } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const min = minutes(m);
      if (min <= 0) continue;
      if (!best || m.index < best.index) {
        best = { minutes: min, match: m[0], index: m.index };
      }
    }
  }

  return best;
}

function findEarliestTime(s: string): { hour: number; minute: number; match: string; index: number } | null {
  const patterns: { re: RegExp; parse: (m: RegExpExecArray) => { hour: number; minute: number } }[] = [
    {
      // `\b` antes de "às" falha no JS (à não é \w); exige início ou espaço antes.
      re: /(?:^|\s)((?:às|as)\s*(\d{1,2})(?::(\d{2}))?(?:\s*h(?:oras?)?)?)(?=\s|$|[,.;])/gi,
      parse: (m) => ({
        hour: Number.parseInt(m[2] ?? "0", 10),
        minute: m[3] ? Number.parseInt(m[3], 10) : 0,
      }),
    },
    {
      re: /\b(\d{1,2}):(\d{2})\b/gi,
      parse: (m) => ({
        hour: Number.parseInt(m[1] ?? "0", 10),
        minute: Number.parseInt(m[2] ?? "0", 10),
      }),
    },
    {
      re: /\b(\d{1,2})h\b/gi,
      parse: (m) => ({
        hour: Number.parseInt(m[1] ?? "0", 10),
        minute: 0,
      }),
    },
  ];

  let best: { hour: number; minute: number; match: string; index: number } | null = null;

  for (const { re, parse } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const { hour, minute } = parse(m);
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
      if (!best || m.index < best.index) {
        best = { hour, minute, match: m[0], index: m.index };
      }
    }
  }

  return best;
}

type DateMatch =
  | { kind: "tomorrow"; label: string; match: string; index: number }
  | { kind: "weekday"; dow: number; label: string; match: string; index: number };

function findDate(s: string): DateMatch | null {
  // `\b` após "ã" em "amanhã" falha no JS; fecha com lookahead de fim de token.
  const tomorrowRe = /\bamanh[ãa](?=\s|$|[,.;])/i;
  const tm = tomorrowRe.exec(s);
  if (tm) {
    return { kind: "tomorrow", label: "amanhã", match: tm[0], index: tm.index };
  }

  let best: DateMatch | null = null;
  for (const spec of WEEKDAY_SPECS) {
    spec.re.lastIndex = 0;
    const m = spec.re.exec(s);
    if (!m) continue;
    if (!best || m.index < best.index) {
      best = {
        kind: "weekday",
        dow: spec.dow,
        label: spec.label,
        match: m[0],
        index: m.index,
      };
    }
  }
  return best;
}

function removeOnce(s: string, substr: string): string {
  const i = s.indexOf(substr);
  if (i < 0) return s;
  return `${s.slice(0, i)} ${s.slice(i + substr.length)}`.replace(/\s+/g, " ").trim();
}

/** Remove partículas de hora que sobram após recortes (ex.: "às Reunião" → "Reunião"). */
function cleanTitleResiduals(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  t = t.replace(/\s+(?:às|as|à)\s+/gi, " ");
  t = t.replace(/^(?:às|as|à)\s+/i, "");
  t = t.replace(/\s+(?:às|as|à)$/i, "");
  return t.replace(/\s+/g, " ").trim();
}

export function parseOpCalendarPreview(rawText: string): OpCalendarPreviewParseResult {
  const raw = rawText.trim();
  if (!raw) {
    return { ok: false, text: "Texto vazio." };
  }

  let s = stripPrefix(raw);
  if (!s) {
    return { ok: false, text: "Informe data, horário e o título do compromisso." };
  }

  const dateHit = findDate(s);
  if (!dateHit) {
    return {
      ok: false,
      text: 'Não encontrei data. Use "amanhã" ou um dia da semana (ex.: sexta, terça-feira).',
    };
  }
  s = removeOnce(s, dateHit.match);

  const timeHit = findEarliestTime(s);
  if (!timeHit) {
    return {
      ok: false,
      text: 'Não encontrei horário. Use por exemplo "às 14h", "às 14:30" ou "14h".',
    };
  }
  s = removeOnce(s, timeHit.match);

  const durHit = findEarliestDuration(s);
  let durationMin = DEFAULT_DURATION_MIN;
  if (durHit) {
    durationMin = durHit.minutes;
    s = removeOnce(s, durHit.match);
  }

  const title = cleanTitleResiduals(s);
  if (!title) {
    return { ok: false, text: "Faltou o título do compromisso (texto após data/hora/duração)." };
  }

  let ymd: Ymd;
  if (dateHit.kind === "tomorrow") {
    ymd = addDaysYmd(ymdInSaoPaulo(new Date()), 1);
  } else {
    ymd = nextYmdForWeekday(dateHit.dow);
  }

  const startRfc = toRfc3339Minus3(ymd, timeHit.hour, timeHit.minute);
  const startMs = new Date(startRfc).getTime();
  const endMs = startMs + durationMin * 60_000;
  const startIso = new Date(startRfc).toISOString();
  const endIso = new Date(endMs).toISOString();

  const df = new Intl.DateTimeFormat("pt-BR", {
    timeZone: OP_CAL_PREVIEW_TZ,
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const text = `Prévia: ${df.format(new Date(startIso))}, ${durationMin} min — ${title}`;

  return {
    ok: true,
    text,
    payload: {
      title,
      start: startIso,
      end: endIso,
      timezone: OP_CAL_PREVIEW_TZ,
    },
  };
}
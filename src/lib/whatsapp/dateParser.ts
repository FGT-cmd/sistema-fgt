// Converte expressões de data natural para YYYY-MM-DD

const PT_DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const PT_DAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

export function parseNaturalDate(text: string, baseDate: Date = new Date()): string | null {
  const s = text.toLowerCase().trim();

  const base = new Date(baseDate);
  base.setHours(0, 0, 0, 0);

  // Hoje / amanhã / depois de amanhã
  if (s === "hoje" || s === "hj") return toISO(base);

  if (s === "amanhã" || s === "amanha" || s === "amanhaa") {
    base.setDate(base.getDate() + 1);
    return toISO(base);
  }

  if (s.includes("depois de amanhã") || s.includes("depois de amanha")) {
    base.setDate(base.getDate() + 2);
    return toISO(base);
  }

  // "semana que vem" / "próxima semana"
  if (s.includes("semana que vem") || s.includes("próxima semana") || s.includes("proxima semana")) {
    base.setDate(base.getDate() + 7);
    return toISO(base);
  }

  // "daqui X dias"
  const daquiMatch = s.match(/daqui\s+(\d+)\s+dias?/);
  if (daquiMatch) {
    base.setDate(base.getDate() + parseInt(daquiMatch[1]));
    return toISO(base);
  }

  // Dia da semana: "sexta", "segunda", "seg", etc.
  for (let i = 0; i < PT_DAYS.length; i++) {
    if (s.includes(PT_DAYS[i]) || s.includes(PT_DAYS_SHORT[i])) {
      const diff = (i - base.getDay() + 7) % 7;
      base.setDate(base.getDate() + (diff === 0 ? 7 : diff));
      return toISO(base);
    }
  }

  // DD/MM ou D/M (ano implícito = ano atual ou próximo)
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (ddmm) {
    const d = new Date(base);
    d.setMonth(parseInt(ddmm[2]) - 1, parseInt(ddmm[1]));
    if (d < base) d.setFullYear(d.getFullYear() + 1);
    return toISO(d);
  }

  // YYYY-MM-DD já formatado
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Extrai a primeira expressão de data reconhecível de um texto livre
export function extractDate(text: string, baseDate: Date = new Date()): string | null {
  const words = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    // Sequências de 2-3 palavras
    const two = words.slice(i, i + 2).join(" ");
    const three = words.slice(i, i + 3).join(" ");

    const r = parseNaturalDate(three, baseDate) ?? parseNaturalDate(two, baseDate) ?? parseNaturalDate(words[i], baseDate);
    if (r) return r;
  }

  // DD/MM/YYYY ou DD/MM
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (match) {
    const year = match[3] ? parseInt(match[3]) : baseDate.getFullYear();
    const d = new Date(year, parseInt(match[2]) - 1, parseInt(match[1]));
    if (d < baseDate) d.setFullYear(d.getFullYear() + 1);
    return toISO(d);
  }

  return null;
}

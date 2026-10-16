// Leitura determinística de extratos OFX e CSV (C6, Nubank e genéricos).
// PDF não passa por aqui: vai para o modelo em capture/interpret.ts.

import type { StatementRow } from "./dedupe";
import { normalizeLabel } from "./vocab";
import { isValidIsoDate } from "./dates";

export type RawStatementRow = { date: string; amount: number; description: string; fitId?: string };

export type ParsedStatement = {
  rows: RawStatementRow[];
  ledgerBalance: { amount: number; date: string } | null;
  isCard: boolean;
  invertSign: boolean; // fatura que lista compras como positivas
};

// Saldo final lido por modelo (PDF): só vale com data YYYY-MM-DD real e valor finito.
export function sanitizeClosingBalance(cb: unknown): ParsedStatement["ledgerBalance"] {
  if (!cb || typeof cb !== "object") return null;
  const { amount, date } = cb as { amount?: unknown; date?: unknown };
  if (typeof date !== "string" || !isValidIsoDate(date)) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return { amount, date };
}

export function parseStatementDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function parseStatementAmount(raw: string): number | null {
  let s = raw.replace(/−/g, "-").replace(/R\$|\s/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // o último separador é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// OFX usa sempre ponto decimal (spec), sem heurística de separador de milhar.
function parseOfxAmount(raw: string): number | null {
  const s = raw.replace(/−/g, "-").replace(/\s/g, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ofxTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

export function parseOfx(text: string): ParsedStatement {
  const rows: RawStatementRow[] = [];
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const date = parseStatementDate(ofxTag(block, "DTPOSTED"));
    const amount = parseOfxAmount(ofxTag(block, "TRNAMT"));
    const description = ofxTag(block, "MEMO") || ofxTag(block, "NAME");
    const fitId = ofxTag(block, "FITID");
    if (!date || amount === null) continue;
    rows.push({ date, amount, description, ...(fitId ? { fitId } : {}) });
  }
  const lb = text.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|$)/i);
  let ledgerBalance: ParsedStatement["ledgerBalance"] = null;
  if (lb) {
    const amount = parseOfxAmount(ofxTag(lb[1], "BALAMT"));
    const date = parseStatementDate(ofxTag(lb[1], "DTASOF"));
    if (amount !== null && date) ledgerBalance = { amount, date };
  }
  return { rows, ledgerBalance, isCard: /<CCSTMTRS>/i.test(text), invertSign: false };
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delim && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const headerIdx = lines.findIndex((l) => /(^|[;,"])\s*"?(data|date)\b/i.test(l));
  const empty: ParsedStatement = { rows: [], ledgerBalance: null, isCard: false, invertSign: false };
  if (headerIdx < 0) return empty;

  const headerLine = lines[headerIdx];
  const delim = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(headerLine, delim).map((h) => normalizeLabel(h));
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));

  const dateCol = find(/^(data|date)/);
  const amountCol = find(/^(valor|amount|value)/);
  const inCol = find(/^(entrada|credito)/);
  const outCol = find(/^(saida|debito)/);
  let descCol = find(/descri/);
  if (descCol < 0) descCol = find(/^title$/);
  if (descCol < 0) descCol = find(/(hist|lancamento|estabelecimento)/);
  if (dateCol < 0 || descCol < 0 || (amountCol < 0 && (inCol < 0 || outCol < 0))) return empty;

  const isCard = header.includes("title");
  const rows: RawStatementRow[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, delim);
    const date = parseStatementDate(cells[dateCol] ?? "");
    let amount: number | null;
    if (amountCol >= 0) {
      amount = parseStatementAmount(cells[amountCol] ?? "");
    } else {
      const inV = parseStatementAmount(cells[inCol] ?? "") ?? 0;
      const outV = parseStatementAmount(cells[outCol] ?? "") ?? 0;
      amount = inV - Math.abs(outV);
    }
    if (!date || amount === null || amount === 0) continue;
    rows.push({ date, amount, description: cells[descCol] ?? "" });
  }
  return { rows, ledgerBalance: null, isCard, invertSign: isCard };
}

export function detectAccount(fileName: string, text: string): string | null {
  const hay = `${fileName}\n${text.slice(0, 4000)}`;
  if (/nubank|nu pagamentos|nu financeira/i.test(hay)) return "Nubank PF";
  if (/(^|[^a-z0-9])c6([^a-z0-9]|$)|banco c6|c6 bank/i.test(hay)) return "C6";
  return null;
}

export function toStatementRows(parsed: ParsedStatement, account: string): StatementRow[] {
  const seen = new Map<string, number>();
  return parsed.rows.map((r) => {
    const amount = parsed.invertSign ? -r.amount : r.amount;
    let externalId: string;
    if (r.fitId) {
      externalId = `${account}|fit|${r.fitId}`;
    } else {
      const base = `${account}|${r.date}|${amount.toFixed(2)}|${normalizeLabel(r.description)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      externalId = `${base}#${n}`;
    }
    return { date: r.date, amount, description: r.description, externalId };
  });
}

export function decodeStatementText(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  const utf8 = buf.toString("utf-8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}

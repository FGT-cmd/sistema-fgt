// Textos de resposta da captura — iguais no Telegram e no Jarvis.

import { fmtBRL, fmtDayMonth, monthLabel } from "../dates";
import type { CaptureResult, TxDraft } from "./types";

export function describeDraft(
  d: Pick<TxDraft, "kind" | "amount" | "category" | "paymentMethod" | "status" | "date">,
): string {
  const parts = [fmtBRL(d.amount), d.category];
  if (d.paymentMethod) parts.push(d.paymentMethod);
  if (d.status === "pago") {
    parts.push(d.kind === "receita" ? "recebido" : "pago", fmtDayMonth(d.date));
  } else {
    parts.push(d.kind === "receita" ? "a receber" : "a pagar", `vence ${fmtDayMonth(d.date)}`);
  }
  return parts.join(" · ");
}

const MAX_PROPOSAL_LINES = 15;

export function summarizeCapture(r: CaptureResult): string {
  const lines: string[] = [];
  if (r.proposalHeader) {
    lines.push(r.proposalHeader);
    for (const p of r.proposals.slice(0, MAX_PROPOSAL_LINES)) {
      lines.push(`• ${p.description}: ${describeDraft(p)}${p.needsReview ? " 🟡" : ""}`);
    }
    if (r.proposals.length > MAX_PROPOSAL_LINES) lines.push(`… e mais ${r.proposals.length - MAX_PROPOSAL_LINES}`);
    for (const s of r.proposalSettles) lines.push(`• Baixa: ${s.description}`);
  }
  for (const s of r.saved) {
    lines.push(s.needsReview ? `🟡 ${describeDraft(s)} (pra revisar)` : `✅ ${describeDraft(s)}`);
  }
  for (const s of r.settled) lines.push(`✅ Baixa: ${s.description}`);
  for (const c of r.recategorized) lines.push(`✅ ${c}`);
  for (const u of r.undone) lines.push(`↩️ Desfeito: ${u}`);
  for (const q of r.questions) lines.push(`❓ ${q.question}`);
  for (const c of r.clarify) lines.push(`❓ ${c}`);
  return lines.length ? lines.join("\n") : "Não registrei nada.";
}

export function statementHeader(p: {
  account: string;
  months: string[];
  novos: number;
  duplicados: number;
  baixas: number;
  revisar: number;
  ignorados: number;
}): string {
  const months = p.months.map(monthLabel).join(", ");
  const parts = [`${p.novos} novos`, `${p.duplicados} já existiam`];
  if (p.baixas) parts.push(`${p.baixas} baixas em contas a pagar`);
  if (p.revisar) parts.push(`${p.revisar} sem categoria clara`);
  if (p.ignorados) parts.push(`${p.ignorados} ignorado${p.ignorados > 1 ? "s" : ""} (transferências/fatura)`);
  return `📎 Extrato ${p.account} · ${months}: ${parts.join(", ")}.`;
}

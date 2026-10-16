// Botões do Telegram para a captura. callback_data curto: fc | fq | fu.

import type { TelegramButton } from "@/lib/telegram";
import type { CaptureResult } from "./types";

export type FinanceCallback =
  | { type: "confirm"; pendingId: string; mode: "all" | "review" | "discard" | "fix" }
  | { type: "answer"; pendingId: string; option: number }
  | { type: "undo"; undoId: string };

export function buildCaptureButtons(r: CaptureResult): TelegramButton[][] {
  const rows: TelegramButton[][] = [];
  if (r.pendingConfirmationId) {
    const id = r.pendingConfirmationId;
    if (r.proposalSource === "foto") {
      rows.push([
        { text: "✅ Gravar", callback_data: `fc:${id}:all` },
        { text: "✏️ Corrigir", callback_data: `fc:${id}:fix` },
      ]);
    } else {
      rows.push([{ text: "✅ Gravar todos", callback_data: `fc:${id}:all` }]);
    }
    rows.push([
      { text: "👀 Revisar no painel", callback_data: `fc:${id}:review` },
      { text: "🗑️ Descartar", callback_data: `fc:${id}:discard` },
    ]);
  }
  for (const q of r.questions) {
    rows.push(q.options.map((o, i) => ({ text: o, callback_data: `fq:${q.pendingId}:${i}` })));
  }
  if (r.undoId) rows.push([{ text: "↩️ Desfazer", callback_data: `fu:${r.undoId}` }]);
  return rows;
}

const MODES = ["all", "review", "discard", "fix"] as const;

export function parseFinanceCallback(data: string): FinanceCallback | null {
  const [prefix, id, extra] = data.split(":");
  if (!id) return null;
  if (prefix === "fc" && (MODES as readonly string[]).includes(extra)) {
    return { type: "confirm", pendingId: id, mode: extra as (typeof MODES)[number] };
  }
  if (prefix === "fq" && /^\d+$/.test(extra ?? "")) return { type: "answer", pendingId: id, option: Number(extra) };
  if (prefix === "fu" && extra === undefined) return { type: "undo", undoId: id };
  return null;
}

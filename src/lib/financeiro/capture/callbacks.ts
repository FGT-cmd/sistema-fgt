import type { TelegramButton } from "@/lib/telegram";
import {
  answerQuestion, confirmPending, discardPending, revertUndo, startCorrection,
} from "./apply";
import { buildCaptureButtons, type FinanceCallback } from "./telegramUi";

export async function handleFinanceCallback(cb: FinanceCallback): Promise<{ text: string; buttons: TelegramButton[][] }> {
  if (cb.type === "answer") {
    return { text: await answerQuestion(cb.pendingId, cb.option), buttons: [] };
  }
  if (cb.type === "undo") {
    const undone = await revertUndo(cb.undoId);
    return {
      text: undone.length ? `↩️ Desfeito:\n${undone.map((u) => `• ${u}`).join("\n")}` : "Nada pra desfazer (a janela é de 24h).",
      buttons: [],
    };
  }
  switch (cb.mode) {
    case "discard":
      return { text: (await discardPending(cb.pendingId)) ? "🗑️ Descartei." : "Isso já tinha sido resolvido.", buttons: [] };
    case "fix":
      return {
        text: (await startCorrection(cb.pendingId))
          ? "Beleza, me manda o certo em texto (ex: \"era marketing, 1.094,67 no nubank\")."
          : "Isso já tinha sido resolvido.",
        buttons: [],
      };
    default: {
      const result = await confirmPending(cb.pendingId, cb.mode);
      return { text: result.summary, buttons: buildCaptureButtons(result) };
    }
  }
}

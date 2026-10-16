// Ponto de entrada da captura para Telegram, Jarvis e painel.

import { getDefaultUser } from "@/lib/user";
import { loadCaptureContext } from "./context";
import { interpret, type ImageMime } from "./interpret";
import { applyActions, saveUnparsed, stageProposals } from "./apply";
import { summarizeCapture } from "./summary";
import { emptyResult, type CaptureResult, type Channel, type SettleProposal, type TxDraft } from "./types";

export async function captureText(text: string, channel: Channel): Promise<CaptureResult> {
  const user = await getDefaultUser();
  const { ctx } = await loadCaptureContext(user.id);
  try {
    const actions = await interpret(ctx, { kind: "text", text });
    return await applyActions(actions, { source: channel, rawInput: text });
  } catch (err) {
    console.error("[finance/captureText]", err);
    return saveUnparsed(text, channel);
  }
}

export async function captureImage(
  imageBase64: string,
  mimeType: ImageMime,
  caption: string | null,
  _channel: Channel,
): Promise<CaptureResult> {
  const user = await getDefaultUser();
  const { ctx } = await loadCaptureContext(user.id);
  const result = emptyResult();

  let actions;
  try {
    actions = await interpret(ctx, { kind: "image", imageBase64, mimeType, caption });
  } catch (err) {
    console.error("[finance/captureImage]", err);
    result.clarify.push("Não consegui ler esse comprovante. Me manda em texto: valor, o que foi e como pagou.");
    result.summary = summarizeCapture(result);
    return result;
  }

  const drafts: TxDraft[] = [];
  const settles: SettleProposal[] = [];
  for (const a of actions) {
    if (a.action === "create") {
      const { action: _a, ...draft } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      drafts.push(draft);
    } else if (a.action === "settle") {
      const item = ctx.openItems.find((i) => i.ref === a.ref);
      settles.push({ ref: a.ref, date: a.date, amount: a.amount, paymentMethod: a.paymentMethod, description: item?.description ?? a.ref });
    } else if (a.action === "clarify") {
      result.clarify.push(a.question);
    }
  }

  if (drafts.length || settles.length) {
    const header = "📷 Entendi do comprovante:";
    result.pendingConfirmationId = await stageProposals({
      drafts, settles, source: "foto", rawInput: caption ?? "(foto)", snapshot: null, header,
    });
    result.proposals = drafts;
    result.proposalSettles = settles;
    result.proposalSource = "foto";
    result.proposalHeader = header;
  }
  result.summary = summarizeCapture(result);
  return result;
}

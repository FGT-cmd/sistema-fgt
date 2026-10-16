import { describe, it, expect } from "vitest";
import { buildCaptureButtons, parseFinanceCallback } from "./telegramUi";
import { emptyResult } from "./types";

const ID = "clz1234567890abcdefghijkl";

describe("telegramUi", () => {
  it("foto tem Gravar, Corrigir, Revisar e Descartar", () => {
    const r = { ...emptyResult(), pendingConfirmationId: ID, proposalSource: "foto" as const };
    expect(buildCaptureButtons(r).flat().map((b) => b.text)).toEqual(["✅ Gravar", "✏️ Corrigir", "👀 Revisar no painel", "🗑️ Descartar"]);
  });

  it("extrato não tem Corrigir", () => {
    const r = { ...emptyResult(), pendingConfirmationId: ID, proposalSource: "extrato" as const };
    expect(buildCaptureButtons(r).flat().map((b) => b.text)).toEqual(["✅ Gravar todos", "👀 Revisar no painel", "🗑️ Descartar"]);
  });

  it("pergunta vira uma linha de opções e desfazer vem por último", () => {
    const r = { ...emptyResult(), undoId: ID, questions: [{ pendingId: ID, txId: "t", question: "?", options: ["Ferramentas e plataformas", "Conhecimento"] }] };
    const rows = buildCaptureButtons(r);
    expect(rows[0].map((b) => b.callback_data)).toEqual([`fq:${ID}:0`, `fq:${ID}:1`]);
    expect(rows[1]).toEqual([{ text: "↩️ Desfazer", callback_data: `fu:${ID}` }]);
  });

  it("todo callback_data cabe nos 64 bytes do Telegram", () => {
    const r = { ...emptyResult(), pendingConfirmationId: ID, proposalSource: "foto" as const, undoId: ID };
    for (const b of buildCaptureButtons(r).flat()) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
  });

  it("parse ida e volta, e ignora dados de outros fluxos", () => {
    expect(parseFinanceCallback(`fc:${ID}:review`)).toEqual({ type: "confirm", pendingId: ID, mode: "review" });
    expect(parseFinanceCallback(`fq:${ID}:1`)).toEqual({ type: "answer", pendingId: ID, option: 1 });
    expect(parseFinanceCallback(`fu:${ID}`)).toEqual({ type: "undo", undoId: ID });
    expect(parseFinanceCallback(`fc:${ID}:hack`)).toBeNull();
    expect(parseFinanceCallback("outro:coisa")).toBeNull();
  });
});

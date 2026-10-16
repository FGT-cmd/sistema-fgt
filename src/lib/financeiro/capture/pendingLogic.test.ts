import { describe, it, expect } from "vitest";
import { isEmptyUndo, splitKnownDrafts, takeUndoPart, undoHasRef, type UndoPayload } from "./pendingLogic";
import type { TxDraft } from "./types";

const prev = { status: "pendente", paidAt: null, amount: 398, paymentMethod: null };
const payload: UndoPayload = {
  created: ["mfit", "gpt"],
  settled: [{ ref: "tx:cont", prev }, { ref: "inst:i9", prev: { ...prev, amount: 1800 } }],
};

describe("desfazer um lançamento específico", () => {
  it("acha o ref entre criados e baixas", () => {
    expect(undoHasRef(payload, "tx:gpt")).toBe(true);
    expect(undoHasRef(payload, "inst:i9")).toBe(true);
    expect(undoHasRef(payload, "tx:outro")).toBe(false);
    expect(undoHasRef(payload, "inst:gpt")).toBe(false);
  });

  it("tira só o lançamento criado que bate e mantém o resto do registro", () => {
    expect(takeUndoPart(payload, "tx:gpt")).toEqual({
      part: { kind: "created", txId: "gpt" },
      rest: { created: ["mfit"], settled: payload.settled },
    });
  });

  it("tira só a baixa que bate", () => {
    expect(takeUndoPart(payload, "tx:cont")).toEqual({
      part: { kind: "settled", ref: "tx:cont", prev },
      rest: { created: ["mfit", "gpt"], settled: [payload.settled[1]] },
    });
  });

  it("ref fora do registro devolve null; registro vazio é detectado", () => {
    expect(takeUndoPart(payload, "tx:outro")).toBeNull();
    const single = takeUndoPart({ created: ["x"], settled: [] }, "tx:x");
    expect(single && isEmptyUndo(single.rest)).toBe(true);
    expect(isEmptyUndo(payload)).toBe(false);
  });
});

describe("confirmação de extrato repetido", () => {
  const d = (externalId: string | null): TxDraft => ({
    kind: "despesa", amount: 10, category: "Outras despesas", description: "x", paymentMethod: null,
    date: "2026-10-01", status: "pago", clientId: null, needsReview: false, alternatives: [], externalId,
  });

  it("pula linhas cujo externalId já foi gravado", () => {
    const r = splitKnownDrafts([d("a"), d("b"), d(null), d("c")], new Set(["a", "c"]));
    expect(r.fresh.map((x) => x.externalId)).toEqual(["b", null]);
    expect(r.skipped).toBe(2);
  });
});

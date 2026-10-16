// Regras puras da janela de desfazer e da confirmação de extrato/foto.
// apply.ts grava; aqui só se decide o quê (testável sem banco).

import { splitRef } from "../ledger";
import type { TxDraft } from "./types";

export type PrevState = { status: string; paidAt: string | null; amount: number; paymentMethod: string | null };
export type UndoPayload = { created: string[]; settled: { ref: string; prev: PrevState }[] };

export type UndoPart =
  | { kind: "created"; txId: string }
  | { kind: "settled"; ref: string; prev: PrevState };

export function undoHasRef(p: UndoPayload, ref: string): boolean {
  const [type, id] = splitRef(ref);
  return (type === "tx" && p.created.includes(id)) || p.settled.some((s) => s.ref === ref);
}

// Separa do registro de desfazer só a parte que o ref aponta. null = o ref não está nele.
// Lançamento criado tem precedência: desfazer um lançamento novo é apagá-lo.
export function takeUndoPart(p: UndoPayload, ref: string): { part: UndoPart; rest: UndoPayload } | null {
  const [type, id] = splitRef(ref);
  if (type === "tx" && p.created.includes(id)) {
    return { part: { kind: "created", txId: id }, rest: { created: p.created.filter((c) => c !== id), settled: p.settled } };
  }
  const s = p.settled.find((x) => x.ref === ref);
  if (!s) return null;
  return {
    part: { kind: "settled", ref: s.ref, prev: s.prev },
    rest: { created: p.created, settled: p.settled.filter((x) => x.ref !== ref) },
  };
}

export function isEmptyUndo(p: UndoPayload): boolean {
  return p.created.length === 0 && p.settled.length === 0;
}

// O mesmo extrato pode ser confirmado duas vezes (enviado de novo antes de confirmar
// o primeiro): linha cujo externalId já está gravado não entra de novo.
export function splitKnownDrafts(drafts: TxDraft[], known: Set<string>): { fresh: TxDraft[]; skipped: number } {
  const fresh = drafts.filter((d) => !d.externalId || !known.has(d.externalId));
  return { fresh, skipped: drafts.length - fresh.length };
}

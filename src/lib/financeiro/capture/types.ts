// Tipos da captura financeira (texto, voz, foto, extrato).

import type { Vocab } from "../vocab";

export type Channel = "telegram" | "jarvis" | "painel";
export type TxKind = "receita" | "despesa";

export type OpenItem = {
  ref: string;
  kind: TxKind;
  description: string;
  category: string;
  amount: number;
  dueDate: string | null;
  clientName: string | null;
};

export type RecentItem = {
  ref: string;
  kind: TxKind;
  description: string;
  category: string;
  amount: number;
  date: string;
  needsReview: boolean;
};

export type CaptureContext = {
  today: string;
  vocab: Vocab;
  openItems: OpenItem[];
  recent: RecentItem[];
  clients: { id: string; name: string }[];
};

// Formato cru devolvido pelo modelo (todos os campos sempre presentes).
export type RawAction = {
  action: "create" | "settle" | "undo" | "recategorize" | "clarify";
  kind: TxKind | null;
  amount: number | null;
  category: string | null;
  description: string | null;
  paymentMethod: string | null;
  date: string | null;
  status: "pago" | "pendente" | null;
  clientName: string | null;
  confidence: "alta" | "baixa" | null;
  alternatives: string[];
  ref: string | null;
  question: string | null;
};

export type TxDraft = {
  kind: TxKind;
  amount: number;
  category: string;
  description: string;
  paymentMethod: string | null;
  date: string;
  status: "pago" | "pendente";
  clientId: string | null;
  needsReview: boolean;
  alternatives: string[];
  externalId: string | null;
};

export type CreateAction = { action: "create" } & TxDraft;
export type SettleAction = { action: "settle"; ref: string; amount: number | null; date: string; paymentMethod: string | null };
export type UndoAction = { action: "undo"; ref: string | null };
export type RecategorizeAction = { action: "recategorize"; ref: string; category: string };
export type ClarifyAction = { action: "clarify"; question: string };
export type CaptureAction = CreateAction | SettleAction | UndoAction | RecategorizeAction | ClarifyAction;

export type SettleProposal = {
  ref: string;
  date: string;
  amount: number | null;
  paymentMethod: string | null;
  description: string;
};

export type CapturedTx = TxDraft & { id: string };

export type CaptureQuestion = { pendingId: string; txId: string; question: string; options: string[] };

export type CaptureResult = {
  saved: CapturedTx[];
  settled: { ref: string; description: string }[];
  undone: string[];
  recategorized: string[];
  questions: CaptureQuestion[];
  clarify: string[];
  proposals: TxDraft[];
  proposalSettles: SettleProposal[];
  proposalSource: "foto" | "extrato" | null;
  proposalHeader: string | null;
  pendingConfirmationId: string | null;
  undoId: string | null;
  summary: string;
};

export function emptyResult(): CaptureResult {
  return {
    saved: [], settled: [], undone: [], recategorized: [], questions: [], clarify: [],
    proposals: [], proposalSettles: [], proposalSource: null, proposalHeader: null,
    pendingConfirmationId: null, undoId: null, summary: "",
  };
}

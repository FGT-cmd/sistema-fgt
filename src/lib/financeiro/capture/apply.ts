// Tudo que a captura grava no banco: lançamentos, baixas, perguntas,
// janela de desfazer (24h) e propostas aguardando confirmação (7 dias).

import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { splitRef } from "../ledger";
import { fmtBRL, toDbDate } from "../dates";
import { summarizeCapture } from "./summary";
import {
  emptyResult,
  type CaptureAction, type CaptureResult, type Channel, type SettleProposal, type TxDraft,
} from "./types";

const OWNER = "owner";
const HOUR = 3_600_000;

type PrevState = { status: string; paidAt: string | null; amount: number; paymentMethod: string | null };
type UndoPayload = { created: string[]; settled: { ref: string; prev: PrevState }[] };
type QuestionPayload = { txId: string; options: string[] };
type ConfirmPayload = {
  drafts: TxDraft[];
  settles: SettleProposal[];
  source: "foto" | "extrato";
  rawInput: string;
  snapshot: { account: string; balance: number; asOf: string } | null;
  header: string;
};
type CorrectionPayload = { proposalText: string };

const expiresIn = (hours: number) => new Date(Date.now() + hours * HOUR);

async function createTx(d: TxDraft, source: string, rawInput: string | null): Promise<string> {
  const tx = await prisma.financialTx.create({
    data: {
      type: d.kind,
      description: d.description,
      amount: d.amount,
      category: d.category,
      status: d.status,
      dueDate: toDbDate(d.date),
      paidAt: d.status === "pago" ? toDbDate(d.date) : null,
      paymentMethod: d.paymentMethod,
      clientId: d.clientId,
      source,
      needsReview: d.needsReview,
      rawInput,
      externalId: d.externalId,
    },
  });
  return tx.id;
}

async function settleRef(
  ref: string,
  date: string,
  amount: number | null,
  paymentMethod: string | null,
): Promise<{ description: string; prev: PrevState }> {
  const [type, id] = splitRef(ref);
  if (type === "tx") {
    const tx = await prisma.financialTx.findUniqueOrThrow({ where: { id } });
    await prisma.financialTx.update({
      where: { id },
      data: {
        status: "pago",
        paidAt: toDbDate(date),
        needsReview: false,
        ...(amount ? { amount } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    });
    return {
      description: `${tx.description} (${fmtBRL(amount ?? tx.amount)})`,
      prev: { status: tx.status, paidAt: tx.paidAt?.toISOString() ?? null, amount: tx.amount, paymentMethod: tx.paymentMethod },
    };
  }
  const inst = await prisma.installment.findUniqueOrThrow({
    where: { id },
    include: { sale: { include: { client: { select: { name: true } } } } },
  });
  await prisma.installment.update({
    where: { id },
    data: { status: "pago", paidAt: toDbDate(date), ...(paymentMethod ? { paymentMethod } : {}) },
  });
  return {
    description: `${inst.sale.client.name} — parcela ${inst.number} (${fmtBRL(inst.amount)})`,
    prev: { status: inst.status, paidAt: inst.paidAt?.toISOString() ?? null, amount: inst.amount, paymentMethod: inst.paymentMethod },
  };
}

async function restoreRef(ref: string, prev: PrevState): Promise<void> {
  const [type, id] = splitRef(ref);
  const paidAt = prev.paidAt ? new Date(prev.paidAt) : null;
  if (type === "tx") {
    await prisma.financialTx.update({
      where: { id },
      data: { status: prev.status, paidAt, amount: prev.amount, paymentMethod: prev.paymentMethod },
    });
  } else {
    await prisma.installment.update({
      where: { id },
      data: { status: prev.status, paidAt, paymentMethod: prev.paymentMethod },
    });
  }
}

async function recordUndo(payload: UndoPayload): Promise<string | null> {
  if (!payload.created.length && !payload.settled.length) return null;
  const rec = await prisma.capturePending.create({
    data: { kind: "undo", chatId: OWNER, payload, expiresAt: expiresIn(24) },
  });
  return rec.id;
}

async function askCategory(txId: string, description: string, amount: number, options: string[]) {
  const pending = await prisma.capturePending.create({
    data: { kind: "question", chatId: OWNER, payload: { txId, options } satisfies QuestionPayload, expiresAt: expiresIn(24 * 7) },
  });
  return {
    pendingId: pending.id,
    txId,
    question: `${description} ${fmtBRL(amount)}: é ${options.join(" ou ")}?`,
    options,
  };
}

async function dropQuestionsFor(txId: string): Promise<void> {
  const qs = await prisma.capturePending.findMany({ where: { chatId: OWNER, kind: "question" } });
  const ids = qs.filter((q) => (q.payload as QuestionPayload).txId === txId).map((q) => q.id);
  if (ids.length) await prisma.capturePending.deleteMany({ where: { id: { in: ids } } });
}

export async function revertUndo(undoId: string): Promise<string[]> {
  const rec = await prisma.capturePending.findUnique({ where: { id: undoId } });
  if (!rec || rec.kind !== "undo" || rec.expiresAt < new Date()) return [];
  const payload = rec.payload as UndoPayload;
  const created = await prisma.financialTx.findMany({ where: { id: { in: payload.created } } });
  await prisma.financialTx.deleteMany({ where: { id: { in: payload.created } } });
  for (const tx of created) await dropQuestionsFor(tx.id);
  for (const s of payload.settled) await restoreRef(s.ref, s.prev);
  await prisma.capturePending.delete({ where: { id: undoId } });
  return [
    ...created.map((t) => `${t.description} ${fmtBRL(t.amount)}`),
    ...payload.settled.map((s) => `baixa de ${s.ref.startsWith("inst:") ? "parcela" : "conta"} (${fmtBRL(s.prev.amount)}) voltou a ficar em aberto`),
  ];
}

async function undoMatching(ref: string | null): Promise<string[]> {
  const records = await prisma.capturePending.findMany({
    where: { chatId: OWNER, kind: "undo", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const target = ref
    ? records.find((r) => {
        const p = r.payload as UndoPayload;
        return p.created.includes(splitRef(ref)[1]) || p.settled.some((s) => s.ref === ref);
      })
    : records[0];
  return target ? revertUndo(target.id) : [];
}

export async function applyActions(
  actions: CaptureAction[],
  opts: { source: Channel; rawInput: string },
): Promise<CaptureResult> {
  const result = emptyResult();
  const undo: UndoPayload = { created: [], settled: [] };

  for (const a of actions) {
    if (a.action === "create") {
      const { action: _a, ...draft } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      const id = await createTx(draft, opts.source, opts.rawInput);
      undo.created.push(id);
      result.saved.push({ ...draft, id });
      if (draft.needsReview && draft.alternatives.length >= 2) {
        result.questions.push(await askCategory(id, draft.description, draft.amount, draft.alternatives));
      }
    } else if (a.action === "settle") {
      const { description, prev } = await settleRef(a.ref, a.date, a.amount, a.paymentMethod);
      undo.settled.push({ ref: a.ref, prev });
      result.settled.push({ ref: a.ref, description });
    } else if (a.action === "undo") {
      const undone = await undoMatching(a.ref);
      if (undone.length) result.undone.push(...undone);
      else result.clarify.push("Não achei nada recente pra desfazer (a janela é de 24h).");
    } else if (a.action === "recategorize") {
      const [, id] = splitRef(a.ref);
      const tx = await prisma.financialTx.update({ where: { id }, data: { category: a.category, needsReview: false } });
      await dropQuestionsFor(id);
      result.recategorized.push(`${tx.description} → ${a.category}`);
    } else {
      result.clarify.push(a.question);
    }
  }

  result.undoId = await recordUndo(undo);
  result.summary = summarizeCapture(result);
  return result;
}

export async function saveUnparsed(text: string, source: Channel): Promise<CaptureResult> {
  const id = await createTx(
    {
      kind: "despesa", amount: 0, category: "Outras despesas", description: text.slice(0, 80),
      paymentMethod: null, date: new Date().toISOString().slice(0, 10), status: "pendente",
      clientId: null, needsReview: true, alternatives: [], externalId: null,
    },
    source,
    text,
  );
  const result = emptyResult();
  result.undoId = await recordUndo({ created: [id], settled: [] });
  result.summary = `Não consegui entender agora, deixei pra revisar: “${text.slice(0, 80)}”`;
  return result;
}

export async function stageProposals(p: ConfirmPayload): Promise<string> {
  const rec = await prisma.capturePending.create({
    data: { kind: "confirm", chatId: OWNER, payload: p, expiresAt: expiresIn(24 * 7) },
  });
  return rec.id;
}

export async function confirmPending(pendingId: string, mode: "all" | "review"): Promise<CaptureResult> {
  const result = emptyResult();
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "confirm" || rec.expiresAt < new Date()) {
    result.clarify.push("Essa confirmação expirou. Me manda de novo.");
    result.summary = summarizeCapture(result);
    return result;
  }
  const p = rec.payload as ConfirmPayload;
  const undo: UndoPayload = { created: [], settled: [] };

  for (const d of p.drafts) {
    const draft = { ...d, needsReview: d.needsReview || mode === "review" };
    const id = await createTx(draft, p.source, p.rawInput);
    undo.created.push(id);
    result.saved.push({ ...draft, id });
  }
  for (const s of p.settles) {
    const { description, prev } = await settleRef(s.ref, s.date, s.amount, s.paymentMethod);
    undo.settled.push({ ref: s.ref, prev });
    result.settled.push({ ref: s.ref, description });
  }
  if (p.snapshot) {
    const user = await getDefaultUser();
    await prisma.bankBalanceSnapshot.create({
      data: { userId: user.id, account: p.snapshot.account, balance: p.snapshot.balance, asOf: toDbDate(p.snapshot.asOf), source: "extrato" },
    });
  }
  await prisma.capturePending.delete({ where: { id: pendingId } });

  result.undoId = await recordUndo(undo);
  result.summary = result.saved.length > 15
    ? `✅ Gravei ${result.saved.length} lançamentos e ${result.settled.length} baixas${mode === "review" ? " (todos marcados pra revisar no painel)" : ""}.`
    : summarizeCapture(result);
  return result;
}

export async function discardPending(pendingId: string): Promise<boolean> {
  const { count } = await prisma.capturePending.deleteMany({ where: { id: pendingId, kind: "confirm" } });
  return count > 0;
}

export async function answerQuestion(pendingId: string, option: number): Promise<string> {
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "question") return "Essa pergunta já foi respondida.";
  const { txId, options } = rec.payload as QuestionPayload;
  const category = options[option];
  await prisma.capturePending.delete({ where: { id: pendingId } });
  const tx = await prisma.financialTx.findUnique({ where: { id: txId } });
  if (!tx || !category) return "Esse lançamento não existe mais.";
  await prisma.financialTx.update({ where: { id: txId }, data: { category, needsReview: false } });
  return `✅ Ok: ${tx.description} → ${category}`;
}

export async function startCorrection(pendingId: string): Promise<boolean> {
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "confirm") return false;
  const p = rec.payload as ConfirmPayload;
  const proposalText = p.drafts.map((d) => `${d.description}: ${d.amount} · ${d.category} · ${d.paymentMethod ?? "forma ?"} · ${d.date}`).join("; ");
  await prisma.capturePending.delete({ where: { id: pendingId } });
  await prisma.capturePending.create({
    data: { kind: "correction", chatId: OWNER, payload: { proposalText } satisfies CorrectionPayload, expiresAt: expiresIn(1) },
  });
  return true;
}

export async function takeCorrection(): Promise<string | null> {
  const rec = await prisma.capturePending.findFirst({
    where: { chatId: OWNER, kind: "correction", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return null;
  await prisma.capturePending.delete({ where: { id: rec.id } });
  return (rec.payload as CorrectionPayload).proposalText;
}

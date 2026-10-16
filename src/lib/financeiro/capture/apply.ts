// Tudo que a captura grava no banco: lançamentos, baixas, perguntas,
// janela de desfazer (24h) e propostas aguardando confirmação (7 dias).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { splitRef } from "../ledger";
import { fmtBRL, isValidIsoDate, toDbDate, todaySaoPaulo } from "../dates";
import { summarizeCapture } from "./summary";
import {
  isEmptyUndo, splitKnownDrafts, takeUndoPart, undoHasRef, type PrevState, type UndoPayload,
} from "./pendingLogic";
import {
  emptyResult,
  type CaptureAction, type CaptureResult, type Channel, type SettleProposal, type TxDraft,
} from "./types";

const OWNER = "owner";
const HOUR = 3_600_000;

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

export const UNDO_FAILED_MSG = "Não consegui desfazer agora. Tenta de novo.";

type Db = Prisma.TransactionClient;
// Statements can have dozens of rows; the default 5s interactive-transaction timeout is too tight.
const TX_OPTS = { maxWait: 10_000, timeout: 60_000 };

async function createTx(db: Db, d: TxDraft, source: string, rawInput: string | null): Promise<string> {
  const tx = await db.financialTx.create({
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

// Returns null when the referenced row no longer exists (nothing is written).
async function settleRef(
  db: Db,
  ref: string,
  date: string,
  amount: number | null,
  paymentMethod: string | null,
): Promise<{ description: string; prev: PrevState } | null> {
  const [type, id] = splitRef(ref);
  if (type === "tx") {
    const tx = await db.financialTx.findUnique({ where: { id } });
    if (!tx) return null;
    await db.financialTx.update({
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
  const inst = await db.installment.findUnique({
    where: { id },
    include: { sale: { include: { client: { select: { name: true } } } } },
  });
  if (!inst) return null;
  await db.installment.update({
    where: { id },
    data: { status: "pago", paidAt: toDbDate(date), ...(paymentMethod ? { paymentMethod } : {}) },
  });
  return {
    description: `${inst.sale.client.name} — parcela ${inst.number} (${fmtBRL(inst.amount)})`,
    prev: { status: inst.status, paidAt: inst.paidAt?.toISOString() ?? null, amount: inst.amount, paymentMethod: inst.paymentMethod },
  };
}

// updateMany: if the row is gone there is nothing to restore (count 0 is fine).
async function restoreRef(db: Db, ref: string, prev: PrevState): Promise<void> {
  const [type, id] = splitRef(ref);
  const paidAt = prev.paidAt ? new Date(prev.paidAt) : null;
  if (type === "tx") {
    await db.financialTx.updateMany({
      where: { id },
      data: { status: prev.status, paidAt, amount: prev.amount, paymentMethod: prev.paymentMethod },
    });
  } else {
    await db.installment.updateMany({
      where: { id },
      data: { status: prev.status, paidAt, paymentMethod: prev.paymentMethod },
    });
  }
}

async function recordUndo(db: Db, payload: UndoPayload): Promise<string | null> {
  if (!payload.created.length && !payload.settled.length) return null;
  const rec = await db.capturePending.create({
    data: { kind: "undo", chatId: OWNER, payload: payload as unknown as Prisma.InputJsonValue, expiresAt: expiresIn(24) },
  });
  return rec.id;
}

async function askCategory(db: Db, txId: string, description: string, amount: number, options: string[]) {
  const pending = await db.capturePending.create({
    data: {
      kind: "question",
      chatId: OWNER,
      payload: { txId, options } satisfies QuestionPayload,
      expiresAt: expiresIn(24 * 7),
    },
  });
  return {
    pendingId: pending.id,
    txId,
    question: `${description} ${fmtBRL(amount)}: é ${options.join(" ou ")}?`,
    options,
  };
}

async function dropQuestionsFor(db: Db, txId: string): Promise<void> {
  const qs = await db.capturePending.findMany({ where: { chatId: OWNER, kind: "question" } });
  const ids = qs.filter((q) => (q.payload as QuestionPayload).txId === txId).map((q) => q.id);
  if (ids.length) await db.capturePending.deleteMany({ where: { id: { in: ids } } });
}

const settledLabel = (s: { ref: string; prev: PrevState }) =>
  `baixa de ${s.ref.startsWith("inst:") ? "parcela" : "conta"} (${fmtBRL(s.prev.amount)}) voltou a ficar em aberto`;

// Desfaz o registro inteiro (botão "Desfazer" do Telegram, "desfaz o último").
// [] = nada pra desfazer (expirado, já desfeito); null = falha ao gravar.
export async function revertUndo(undoId: string): Promise<string[] | null> {
  try {
    return await prisma.$transaction(async (db) => {
      // Lock + read inside the transaction: a concurrent partial undo can't leave us a stale payload.
      await db.$executeRaw`SELECT id FROM "CapturePending" WHERE id = ${undoId} FOR UPDATE`;
      const rec = await db.capturePending.findUnique({ where: { id: undoId } });
      if (!rec || rec.kind !== "undo" || rec.chatId !== OWNER || rec.expiresAt < new Date()) return [];
      const payload = rec.payload as UndoPayload;
      // Claim first: a second tap finds count 0 and does nothing.
      const { count } = await db.capturePending.deleteMany({
        where: { id: undoId, kind: "undo", chatId: OWNER, expiresAt: { gt: new Date() } },
      });
      if (count !== 1) return [];
      const created = await db.financialTx.findMany({ where: { id: { in: payload.created } } });
      await db.financialTx.deleteMany({ where: { id: { in: payload.created } } });
      for (const tx of created) await dropQuestionsFor(db, tx.id);
      for (const s of payload.settled) await restoreRef(db, s.ref, s.prev);
      return [
        ...created.map((t) => `${t.description} ${fmtBRL(t.amount)}`),
        ...payload.settled.map(settledLabel),
      ];
    }, TX_OPTS);
  } catch (err) {
    console.error("[finance/revertUndo]", err);
    return null;
  }
}

// Desfaz só o lançamento/baixa que o ref aponta; o resto do registro continua desfazível.
async function revertUndoPart(undoId: string, ref: string): Promise<string[] | null> {
  try {
    return await prisma.$transaction(async (db) => {
      // Lock the record so a concurrent undo (whole or partial) can't rewrite it under us.
      await db.$executeRaw`SELECT id FROM "CapturePending" WHERE id = ${undoId} FOR UPDATE`;
      const rec = await db.capturePending.findUnique({ where: { id: undoId } });
      if (!rec || rec.kind !== "undo" || rec.chatId !== OWNER || rec.expiresAt < new Date()) return [];
      const taken = takeUndoPart(rec.payload as UndoPayload, ref);
      if (!taken) return [];
      if (isEmptyUndo(taken.rest)) {
        await db.capturePending.delete({ where: { id: undoId } });
      } else {
        await db.capturePending.update({
          where: { id: undoId },
          data: { payload: taken.rest as unknown as Prisma.InputJsonValue },
        });
      }
      const { part } = taken;
      if (part.kind === "settled") {
        await restoreRef(db, part.ref, part.prev);
        return [settledLabel(part)];
      }
      const tx = await db.financialTx.findUnique({ where: { id: part.txId } });
      if (!tx) return [];
      await db.financialTx.delete({ where: { id: part.txId } });
      await dropQuestionsFor(db, part.txId);
      return [`${tx.description} ${fmtBRL(tx.amount)}`];
    }, TX_OPTS);
  } catch (err) {
    console.error("[finance/revertUndoPart]", err);
    return null;
  }
}

// ref null = o registro mais recente inteiro; ref = só aquele lançamento/baixa.
async function undoMatching(ref: string | null): Promise<string[] | null> {
  let records;
  try {
    records = await prisma.capturePending.findMany({
      where: { chatId: OWNER, kind: "undo", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.error("[finance/undoMatching]", err);
    return null;
  }
  if (!ref) return records[0] ? revertUndo(records[0].id) : [];
  const target = records.find((r) => undoHasRef(r.payload as UndoPayload, ref));
  return target ? revertUndoPart(target.id, ref) : [];
}

export async function applyActions(
  actions: CaptureAction[],
  opts: { source: Channel; rawInput: string },
): Promise<CaptureResult> {
  const result = emptyResult();

  // Undo is atomic by itself (revertUndo), so it runs before the write transaction.
  for (const a of actions) {
    if (a.action !== "undo") continue;
    const undone = await undoMatching(a.ref);
    if (undone === null) result.clarify.push(UNDO_FAILED_MSG);
    else if (undone.length) result.undone.push(...undone);
    else result.clarify.push("Não achei nada recente pra desfazer (a janela é de 24h).");
  }

  try {
    await prisma.$transaction(async (db) => {
      const undo: UndoPayload = { created: [], settled: [] };
      for (const a of actions) {
        if (a.action === "create") {
          const { action: _a, ...draft } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
          const id = await createTx(db, draft, opts.source, opts.rawInput);
          undo.created.push(id);
          result.saved.push({ ...draft, id });
          if (draft.needsReview && draft.alternatives.length >= 2) {
            result.questions.push(await askCategory(db, id, draft.description, draft.amount, draft.alternatives));
          }
        } else if (a.action === "settle") {
          const settled = await settleRef(db, a.ref, a.date, a.amount, a.paymentMethod);
          if (!settled) {
            result.clarify.push(`Não achei mais essa conta (${a.ref}).`);
            continue;
          }
          undo.settled.push({ ref: a.ref, prev: settled.prev });
          result.settled.push({ ref: a.ref, description: settled.description });
        } else if (a.action === "recategorize") {
          const [, id] = splitRef(a.ref);
          const found = await db.financialTx.findUnique({ where: { id } });
          if (!found) {
            result.clarify.push(`Não achei mais esse lançamento (${a.ref}).`);
            continue;
          }
          await db.financialTx.update({ where: { id }, data: { category: a.category, needsReview: false } });
          await dropQuestionsFor(db, id);
          result.recategorized.push(`${found.description} → ${a.category}`);
        } else if (a.action === "clarify") {
          result.clarify.push(a.question);
        }
      }
      result.undoId = await recordUndo(db, undo);
    }, TX_OPTS);
  } catch (err) {
    console.error("[finance/applyActions]", err);
    const failed = emptyResult();
    failed.summary = "Falha ao gravar, nada foi alterado. Tenta de novo.";
    return failed;
  }

  result.summary = summarizeCapture(result);
  return result;
}

export async function saveUnparsed(text: string, source: Channel): Promise<CaptureResult> {
  const result = emptyResult();
  await prisma.$transaction(async (db) => {
    const id = await createTx(
      db,
      {
        kind: "despesa", amount: 0, category: "Outras despesas", description: text.slice(0, 80),
        paymentMethod: null, date: todaySaoPaulo(), status: "pendente",
        clientId: null, needsReview: true, alternatives: [], externalId: null,
      },
      source,
      text,
    );
    result.undoId = await recordUndo(db, { created: [id], settled: [] });
  }, TX_OPTS);
  result.summary = `Não consegui entender agora, deixei pra revisar: “${text.slice(0, 80)}”`;
  return result;
}

export async function stageProposals(p: ConfirmPayload): Promise<string> {
  const rec = await prisma.capturePending.create({
    data: { kind: "confirm", chatId: OWNER, payload: p as unknown as Prisma.InputJsonValue, expiresAt: expiresIn(24 * 7) },
  });
  return rec.id;
}

export async function confirmPending(pendingId: string, mode: "all" | "review"): Promise<CaptureResult> {
  const expired = (): CaptureResult => {
    const r = emptyResult();
    r.clarify.push("Essa confirmação expirou. Me manda de novo.");
    r.summary = summarizeCapture(r);
    return r;
  };
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "confirm" || rec.chatId !== OWNER || rec.expiresAt < new Date()) return expired();
  const p = rec.payload as ConfirmPayload;
  const user = p.snapshot ? await getDefaultUser() : null;

  const result = emptyResult();
  let alreadySaved = 0;
  const claimed = await prisma.$transaction(async (db) => {
    // Claim first (inside the transaction): a double-tap finds count 0 and writes nothing.
    const { count } = await db.capturePending.deleteMany({
      where: { id: pendingId, kind: "confirm", chatId: OWNER, expiresAt: { gt: new Date() } },
    });
    if (count !== 1) return false;
    const undo: UndoPayload = { created: [], settled: [] };

    // Same statement staged twice: serialize confirmations, then skip rows already saved.
    // ($executeRaw: pg_advisory_xact_lock returns void, which $queryRaw can't deserialize.)
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('finance-confirm'))`;
    const ids = p.drafts.map((d) => d.externalId).filter((x): x is string => !!x);
    const known = new Set(
      ids.length
        ? (await db.financialTx.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } }))
            .map((t) => t.externalId)
            .filter((x): x is string => !!x)
        : [],
    );
    const { fresh, skipped } = splitKnownDrafts(p.drafts, known);
    alreadySaved = skipped;

    for (const d of fresh) {
      const draft = { ...d, needsReview: d.needsReview || mode === "review" };
      const id = await createTx(db, draft, p.source, p.rawInput);
      undo.created.push(id);
      result.saved.push({ ...draft, id });
    }
    for (const s of p.settles) {
      const settled = await settleRef(db, s.ref, s.date, s.amount, s.paymentMethod);
      if (!settled) {
        result.clarify.push(`Não achei mais: ${s.description}`);
        continue;
      }
      undo.settled.push({ ref: s.ref, prev: settled.prev });
      result.settled.push({ ref: s.ref, description: settled.description });
    }
    // Snapshot with an invalid date is dropped, never fatal (the rows still get saved).
    if (p.snapshot && user && isValidIsoDate(p.snapshot.asOf) && Number.isFinite(p.snapshot.balance)) {
      await db.bankBalanceSnapshot.create({
        data: { userId: user.id, account: p.snapshot.account, balance: p.snapshot.balance, asOf: toDbDate(p.snapshot.asOf), source: "extrato" },
      });
    }
    result.undoId = await recordUndo(db, undo);
    return true;
  }, TX_OPTS);
  if (!claimed) return expired();

  result.summary = result.saved.length > 15
    ? `✅ Gravei ${result.saved.length} lançamentos e ${result.settled.length} baixas${mode === "review" ? " (todos marcados pra revisar no painel)" : ""}.`
    : summarizeCapture(result);
  if (alreadySaved > 0) {
    const line = `${alreadySaved} já tinham sido lançados.`;
    const anythingElse = result.saved.length || result.settled.length || result.clarify.length;
    result.summary = anythingElse ? `${result.summary}\n${line}` : line;
  }
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

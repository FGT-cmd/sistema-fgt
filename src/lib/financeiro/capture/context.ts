import { prisma } from "@/lib/prisma";
import { ensureFinanceSetup } from "../setup";
import { loadLedger } from "../ledgerLoader";
import { selectOpenItems, type LedgerEntry } from "../ledger";
import { isoDate, todaySaoPaulo } from "../dates";
import type { CaptureContext } from "./types";

const CAPTURE_SOURCES = ["telegram", "jarvis", "foto", "extrato"];

export async function loadCaptureContext(userId: string): Promise<{ ctx: CaptureContext; ledger: LedgerEntry[] }> {
  const vocab = await ensureFinanceSetup(userId);
  const today = todaySaoPaulo();
  const [ledger, clients, recentTxs] = await Promise.all([
    loadLedger(userId),
    prisma.client.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.financialTx.findMany({
      where: {
        updatedAt: { gte: new Date(Date.now() - 48 * 3_600_000) },
        source: { in: CAPTURE_SOURCES },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const ctx: CaptureContext = {
    today,
    vocab,
    clients,
    openItems: selectOpenItems(ledger, today).map((e) => ({
      ref: e.ref,
      kind: e.kind,
      description: e.description,
      category: e.category,
      amount: e.amount,
      dueDate: e.dueDate,
      clientName: e.clientName,
    })),
    recent: recentTxs.map((t) => ({
      ref: `tx:${t.id}`,
      kind: t.type === "receita" ? "receita" : "despesa",
      description: t.description,
      category: t.category,
      amount: t.amount,
      date: isoDate(t.paidAt ?? t.dueDate ?? t.createdAt),
      needsReview: t.needsReview,
    })),
  };
  return { ctx, ledger };
}

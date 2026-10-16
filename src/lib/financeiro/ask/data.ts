import { prisma } from "@/lib/prisma";
import { ensureFinanceSetup } from "../setup";
import { loadLedger } from "../ledgerLoader";
import { isoDate, todaySaoPaulo } from "../dates";
import type { AskData } from "./tools";

const DEFAULT_MONTHLY_GOAL = 35000;

export async function loadAskData(userId: string): Promise<AskData> {
  const vocab = await ensureFinanceSetup(userId);
  const [ledger, snapshots, goalRows] = await Promise.all([
    loadLedger(userId),
    prisma.bankBalanceSnapshot.findMany({ where: { userId }, orderBy: { asOf: "desc" } }),
    prisma.financialConfig.findMany({ where: { userId, type: "goal" } }),
  ]);
  const goals: Record<string, number> = {};
  for (const g of goalRows) {
    const v = Number(g.value);
    if (g.key && Number.isFinite(v)) goals[g.key] = v;
  }
  return {
    today: todaySaoPaulo(),
    ledger,
    vocab,
    snapshots: snapshots.map((s) => ({ account: s.account, balance: s.balance, asOf: isoDate(s.asOf) })),
    monthlyGoal: goals.rec_mensal ?? DEFAULT_MONTHLY_GOAL,
    goals,
  };
}

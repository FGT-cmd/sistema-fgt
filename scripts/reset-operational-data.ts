/**
 * Script de limpeza segura de dados de teste.
 *
 * Uso:
 *   CONFIRM_CLEAR_TEST_DATA=true npx tsx scripts/reset-operational-data.ts
 *
 * Flags opcionais:
 *   --include-month-closes   também apaga FinancialMonthClose
 *   --include-events         também apaga WhatsAppEvent e OpenClawEvent
 *   --include-deals          também apaga Deal (leads)
 *
 * O que NÃO é apagado:
 *   User, FinancialConfig, ServicePlan, estrutura do banco, variáveis de ambiente
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

// Carrega .env.local depois .env
dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── Configuração ─────────────────────────────────────────────────

const CONFIRM = process.env.CONFIRM_CLEAR_TEST_DATA === "true";
const args = process.argv.slice(2);
const INCLUDE_MONTH_CLOSES = args.includes("--include-month-closes");
const INCLUDE_EVENTS       = args.includes("--include-events");
const INCLUDE_DEALS        = args.includes("--include-deals");

// ─── Cliente Prisma ───────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ─── Helpers ─────────────────────────────────────────────────────

function line(char = "─", len = 60) { return char.repeat(len); }

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function red(s: string)  { return `\x1b[31m${s}\x1b[0m`; }
function grn(s: string)  { return `\x1b[32m${s}\x1b[0m`; }
function yel(s: string)  { return `\x1b[33m${s}\x1b[0m`; }

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + line("═") + "\n" + bold("  RESET DE DADOS OPERACIONAIS — SISTEMA FGT") + "\n" + line("═"));

  // 1. Contagens atuais
  console.log("\n" + bold("Contando registros atuais...\n"));

  const counts = {
    invoiceIssues:    await prisma.invoiceIssue.count(),
    studentJourneys:  await prisma.studentJourney.count(),
    checkoutSessions: await prisma.checkoutSession.count(),
    sales:            await prisma.sale.count(),
    installments:     await prisma.installment.count(),
    financialTxs:     await prisma.financialTx.count(),
    monthCloses:      INCLUDE_MONTH_CLOSES ? await prisma.financialMonthClose.count() : null,
    whatsAppEvents:   INCLUDE_EVENTS       ? await prisma.whatsAppEvent.count()       : null,
    openClawEvents:   INCLUDE_EVENTS       ? await prisma.openClawEvent.count()       : null,
    deals:            INCLUDE_DEALS        ? await prisma.deal.count()                : null,
  };

  // 2. O que SERÁ apagado
  console.log(bold("O que será apagado:") + "\n" + line());
  console.log(yel(`  InvoiceIssue        : ${counts.invoiceIssues}`));
  console.log(yel(`  StudentJourney      : ${counts.studentJourneys}`));
  console.log(yel(`  CheckoutSession     : ${counts.checkoutSessions}`));
  console.log(yel(`  Sale                : ${counts.sales}`));
  console.log(yel(`  Installment         : ${counts.installments} (cascade de Sale)`));
  console.log(yel(`  FinancialTx         : ${counts.financialTxs}`));

  if (INCLUDE_MONTH_CLOSES) {
    console.log(yel(`  FinancialMonthClose : ${counts.monthCloses} [--include-month-closes]`));
  }
  if (INCLUDE_EVENTS) {
    console.log(yel(`  WhatsAppEvent       : ${counts.whatsAppEvents} [--include-events]`));
    console.log(yel(`  OpenClawEvent       : ${counts.openClawEvents} [--include-events]`));
  }
  if (INCLUDE_DEALS) {
    console.log(yel(`  Deal                : ${counts.deals} [--include-deals]`));
  }

  // 3. O que NÃO será apagado
  console.log("\n" + bold("O que NÃO será apagado:") + "\n" + line());
  console.log(grn("  User, FinancialConfig, ServicePlan, Client"));
  if (!INCLUDE_MONTH_CLOSES) console.log(grn("  FinancialMonthClose (use --include-month-closes para incluir)"));
  if (!INCLUDE_EVENTS)       console.log(grn("  WhatsAppEvent, OpenClawEvent (use --include-events para incluir)"));
  if (!INCLUDE_DEALS)        console.log(grn("  Deal (use --include-deals para incluir)"));

  // 4. Verificar confirmação
  if (!CONFIRM) {
    console.log("\n" + line("─"));
    console.log(red(bold("  ATENÇÃO: Nenhum dado foi apagado.")));
    console.log("  Para executar a limpeza, rode:");
    console.log(bold("  CONFIRM_CLEAR_TEST_DATA=true npx tsx scripts/reset-operational-data.ts\n"));
    console.log("  Flags opcionais:");
    console.log("    --include-month-closes   apaga também FinancialMonthClose");
    console.log("    --include-events         apaga também WhatsAppEvent e OpenClawEvent");
    console.log("    --include-deals          apaga também Deal (leads)\n");
    await prisma.$disconnect();
    return;
  }

  // 5. Executar limpeza na ordem correta (respeitando FKs)
  console.log("\n" + line("─"));
  console.log(bold("Iniciando limpeza...\n"));

  const deleted: Record<string, number> = {};

  // InvoiceIssue: sem dependentes
  const r1 = await prisma.invoiceIssue.deleteMany({});
  deleted["InvoiceIssue"] = r1.count;
  console.log(`  ✓ InvoiceIssue        : ${r1.count} apagados`);

  // StudentJourney: sem dependentes relevantes
  const r2 = await prisma.studentJourney.deleteMany({});
  deleted["StudentJourney"] = r2.count;
  console.log(`  ✓ StudentJourney      : ${r2.count} apagados`);

  // CheckoutSession: depois de InvoiceIssue e StudentJourney (SetNull)
  const r3 = await prisma.checkoutSession.deleteMany({});
  deleted["CheckoutSession"] = r3.count;
  console.log(`  ✓ CheckoutSession     : ${r3.count} apagados`);

  // Sale: cascata apaga Installment → FinancialTx (via installmentId)
  const r4 = await prisma.sale.deleteMany({});
  deleted["Sale"] = r4.count;
  console.log(`  ✓ Sale + Installment  : ${r4.count} vendas apagadas (parcelas em cascade)`);

  // FinancialTx restantes (lançamentos manuais, não vinculados a parcelas)
  const r5 = await prisma.financialTx.deleteMany({});
  deleted["FinancialTx"] = r5.count;
  console.log(`  ✓ FinancialTx restant : ${r5.count} apagados`);

  if (INCLUDE_MONTH_CLOSES) {
    const r6 = await prisma.financialMonthClose.deleteMany({});
    deleted["FinancialMonthClose"] = r6.count;
    console.log(`  ✓ FinancialMonthClose : ${r6.count} apagados`);
  }

  if (INCLUDE_EVENTS) {
    const r7 = await prisma.whatsAppEvent.deleteMany({});
    const r8 = await prisma.openClawEvent.deleteMany({});
    deleted["WhatsAppEvent"] = r7.count;
    deleted["OpenClawEvent"] = r8.count;
    console.log(`  ✓ WhatsAppEvent       : ${r7.count} apagados`);
    console.log(`  ✓ OpenClawEvent       : ${r8.count} apagados`);
  }

  if (INCLUDE_DEALS) {
    const r9 = await prisma.deal.deleteMany({});
    deleted["Deal"] = r9.count;
    console.log(`  ✓ Deal                : ${r9.count} apagados`);
  }

  // 6. Resumo final
  const total = Object.values(deleted).reduce((s, n) => s + n, 0);
  console.log("\n" + line("═"));
  console.log(grn(bold(`  Limpeza concluída. ${total} registros apagados no total.`)));
  console.log(line("═") + "\n");

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(red("\nErro durante a limpeza:"), err);
  prisma.$disconnect();
  process.exit(1);
});

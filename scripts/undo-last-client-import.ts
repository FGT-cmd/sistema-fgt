/**
 * Desfaz importação recente de clientes via CSV/planilha.
 *
 * Modo simulação (padrão — nada é apagado):
 *   npx tsx scripts/undo-last-client-import.ts
 *   npx tsx scripts/undo-last-client-import.ts --since-hours=3
 *   npx tsx scripts/undo-last-client-import.ts --since-hours=3 --source=csv
 *
 * Execução real (apaga de verdade):
 *   CONFIRM_UNDO_CLIENT_IMPORT=true npx tsx scripts/undo-last-client-import.ts --since-hours=3
 *
 * Flags disponíveis:
 *   --since-hours=N      janela de tempo em horas (padrão: 3)
 *   --source=VALOR       filtrar por source exato (ex: csv, import, manual_import)
 *   --include-checkout   incluir clientes com source=checkout_infinitepay (use com cuidado)
 *
 * Nunca apaga: User, FinancialConfig, ServicePlan, CheckoutSession, dados globais
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── Configuração ─────────────────────────────────────────────────

const CONFIRM = process.env.CONFIRM_UNDO_CLIENT_IMPORT === "true";
const rawArgs  = process.argv.slice(2);

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  return rawArgs.find(a => a.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const sinceHours      = parseFloat(parseArg("since-hours") ?? "3");
const sourceFilter    = parseArg("source");
const includeCheckout = rawArgs.includes("--include-checkout");

// ─── Prisma ──────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ─── Helpers ─────────────────────────────────────────────────────

const line = (c = "─", n = 60) => c.repeat(n);
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red  = (s: string) => `\x1b[31m${s}\x1b[0m`;
const grn  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yel  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;

function fmtDate(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function plural(n: number, singular: string, pluralForm?: string) {
  return `${n} ${n === 1 ? singular : (pluralForm ?? singular + "s")}`;
}

// ─── Contagem de vínculos por cliente ─────────────────────────────

async function countLinks(clientId: string) {
  const [
    sales, installments, financialTxs, invoiceIssues, studentJourneys,
    todoTasks, interactions, anamnese, workoutPlans, bodyRecords, checkIns,
    invoices, contracts, studentFiles, deals, followUpLogs, projects,
  ] = await Promise.all([
    prisma.sale.count({ where: { clientId } }),
    prisma.installment.count({ where: { sale: { clientId } } }),
    prisma.financialTx.count({ where: { clientId } }),
    prisma.invoiceIssue.count({ where: { clientId } }),
    prisma.studentJourney.count({ where: { clientId } }),
    prisma.todoTask.count({ where: { clientId } }),
    prisma.interaction.count({ where: { clientId } }),
    prisma.anamnese.count({ where: { clientId } }),
    prisma.workoutPlan.count({ where: { clientId } }),
    prisma.bodyRecord.count({ where: { clientId } }),
    prisma.checkIn.count({ where: { clientId } }),
    prisma.invoice.count({ where: { clientId } }),
    prisma.contract.count({ where: { clientId } }),
    prisma.studentFile.count({ where: { clientId } }),
    prisma.deal.count({ where: { clientId } }),
    prisma.followUpLog.count({ where: { clientId } }),
    prisma.project.count({ where: { clientId } }),
  ]);
  return {
    sales, installments, financialTxs, invoiceIssues, studentJourneys,
    todoTasks, interactions, anamnese, workoutPlans, bodyRecords, checkIns,
    invoices, contracts, studentFiles, deals, followUpLogs, projects,
  };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  console.log("\n" + line("═") + "\n" + bold("  DESFAZER IMPORTAÇÃO DE ALUNOS — SISTEMA FGT") + "\n" + line("═"));
  console.log(dim(`  Janela temporal : últimas ${sinceHours}h  (desde ${fmtDate(since)})`));
  if (sourceFilter) {
    console.log(dim(`  Filtro source   : "${sourceFilter}"`));
  } else {
    console.log(dim(`  Filtro source   : todos exceto checkout_infinitepay${includeCheckout ? dim(" (ignorado: --include-checkout ativo)") : ""}`));
  }
  console.log(dim(`  Modo            : ${CONFIRM ? red("🔴 EXECUÇÃO REAL — dados serão apagados permanentemente") : yel("🟡 SIMULAÇÃO — nenhum dado será apagado")}`));
  console.log("");

  // ─── Montar where ──────────────────────────────────────────────

  let where: Prisma.ClientWhereInput;

  if (sourceFilter) {
    where = {
      createdAt: { gte: since },
      source: sourceFilter,
    };
  } else if (includeCheckout) {
    where = { createdAt: { gte: since } };
  } else {
    // Inclui source=null e qualquer source exceto checkout_infinitepay
    where = {
      createdAt: { gte: since },
      OR: [
        { source: null },
        { source: { not: "checkout_infinitepay" } },
      ],
    };
  }

  // ─── Buscar clientes ───────────────────────────────────────────

  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, source: true, createdAt: true },
  });

  if (clients.length === 0) {
    console.log(grn("Nenhum cliente encontrado com os filtros aplicados. Nada a fazer."));
    console.log("");
    return;
  }

  // ─── Coletar vínculos ──────────────────────────────────────────

  console.log(bold(`Clientes que ${CONFIRM ? "serão" : "seriam"} apagados:\n`));

  const allLinks: Record<string, Awaited<ReturnType<typeof countLinks>>> = {};
  for (const c of clients) {
    allLinks[c.id] = await countLinks(c.id);
  }

  for (const c of clients) {
    const lk = allLinks[c.id];
    const totalLinks = Object.values(lk).reduce((a, b) => a + b, 0);

    console.log(`  ${bold("▸")} ${c.name}`);
    console.log(dim(`    ID       : ${c.id}`));
    if (c.email) console.log(dim(`    Email    : ${c.email}`));
    if (c.phone) console.log(dim(`    Telefone : ${c.phone}`));
    console.log(dim(`    Source   : ${c.source ?? "—"}`));
    console.log(dim(`    Criado   : ${fmtDate(c.createdAt)}`));

    if (totalLinks > 0) {
      const parts = [
        lk.sales          > 0 ? yel(plural(lk.sales, "venda"))                          : null,
        lk.installments   > 0 ? yel(plural(lk.installments, "parcela"))                  : null,
        lk.financialTxs   > 0 ? yel(plural(lk.financialTxs, "lançamento"))               : null,
        lk.invoiceIssues  > 0 ? yel(plural(lk.invoiceIssues, "nota fiscal", "notas fiscais")) : null,
        lk.studentJourneys > 0 ? yel(plural(lk.studentJourneys, "jornada"))              : null,
        lk.todoTasks      > 0 ? yel(plural(lk.todoTasks, "tarefa"))                      : null,
        lk.interactions   > 0 ? yel(plural(lk.interactions, "interação", "interações")) : null,
        lk.anamnese       > 0 ? yel("1 anamnese")                                        : null,
        lk.workoutPlans   > 0 ? yel(plural(lk.workoutPlans, "treino"))                   : null,
        lk.bodyRecords    > 0 ? yel(plural(lk.bodyRecords, "medição", "medições"))       : null,
        lk.checkIns       > 0 ? yel(plural(lk.checkIns, "check-in"))                    : null,
        lk.invoices       > 0 ? yel(plural(lk.invoices, "fatura"))                       : null,
        lk.contracts      > 0 ? yel(plural(lk.contracts, "contrato"))                    : null,
        lk.studentFiles   > 0 ? yel(plural(lk.studentFiles, "arquivo"))                  : null,
        lk.deals          > 0 ? yel(plural(lk.deals, "deal"))                            : null,
        lk.followUpLogs   > 0 ? yel(plural(lk.followUpLogs, "follow-up"))                : null,
        lk.projects       > 0 ? yel(plural(lk.projects, "projeto"))                      : null,
      ].filter(Boolean);
      console.log(`    Vínculos : ${parts.join(dim(" · "))}`);
    } else {
      console.log(dim(`    Vínculos : nenhum`));
    }
    console.log("");
  }

  console.log(line());
  console.log(bold(`Total: ${plural(clients.length, "cliente")} ${clients.length === 1 ? "seria" : "seriam"} apagado${clients.length !== 1 ? "s" : ""}.`));

  if (!CONFIRM) {
    console.log(yel("\nNenhum dado foi apagado (modo simulação)."));
    console.log("\nPara executar a limpeza real:");
    const cmd = [
      "CONFIRM_UNDO_CLIENT_IMPORT=true",
      "npx tsx scripts/undo-last-client-import.ts",
      `--since-hours=${sinceHours}`,
      sourceFilter    ? `--source=${sourceFilter}` : null,
      includeCheckout ? "--include-checkout"        : null,
    ].filter(Boolean).join(" ");
    console.log(bold(`  ${cmd}`));
    console.log("");
    return;
  }

  // ─── Execução real ─────────────────────────────────────────────

  console.log("\n" + bold("Iniciando remoção...\n"));

  let removed = 0;
  let failed  = 0;
  const totals = { followUpLogs: 0, projects: 0 };

  for (const c of clients) {
    process.stdout.write(`  ${c.name}... `);
    try {
      await prisma.$transaction(async (tx) => {
        // 1. FollowUpLog: FK obrigatória sem cascade → deletar explicitamente
        const fl = await tx.followUpLog.deleteMany({ where: { clientId: c.id } });
        totals.followUpLogs += fl.count;

        // 2. Project: FK obrigatória sem cascade → deletar (Task cascateia de Project)
        const pr = await tx.project.deleteMany({ where: { clientId: c.id } });
        totals.projects += pr.count;

        // 3. CalendarEvent: FK nullable, sem cascade → nullificar (evento preservado)
        await tx.calendarEvent.updateMany({
          where: { clientId: c.id },
          data:  { clientId: null },
        });

        // 4. TodoTask: FK nullable, sem cascade → nullificar (tarefa preservada)
        await tx.todoTask.updateMany({
          where: { clientId: c.id },
          data:  { clientId: null },
        });

        // 5. Client: cascade cobre Deal, Interaction, Invoice, Contract, Anamnese,
        //    WorkoutPlan (→ WorkoutDay → WorkoutItem), BodyRecord, CheckIn,
        //    StudentFile, InvoiceIssue, StudentJourney,
        //    Sale (→ Installment → FinancialTx via installmentId)
        //    SetNull: CheckoutSession.clientId, FinancialTx.clientId (standalone)
        await tx.client.delete({ where: { id: c.id } });
      });

      removed++;
      process.stdout.write(grn("ok\n"));
    } catch (err) {
      failed++;
      process.stdout.write(red("ERRO\n"));
      console.error(red(`    ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  // ─── Resumo final ──────────────────────────────────────────────

  console.log("\n" + line("═"));
  if (totals.followUpLogs > 0) console.log(`  ✓ FollowUpLogs removidos  : ${totals.followUpLogs}`);
  if (totals.projects     > 0) console.log(`  ✓ Projetos removidos      : ${totals.projects} (tarefas em cascade)`);
  console.log(`  ✓ Clientes removidos      : ${removed} de ${clients.length}`);
  if (failed > 0) console.log(red(`  ✗ Com erro                : ${failed}`));
  console.log(line("═"));
  console.log(removed === clients.length
    ? grn(bold("\n  ✅ Importação desfeita com sucesso.\n"))
    : red(bold(`\n  ⚠️  ${failed} cliente(s) não foram removidos. Verifique os erros acima.\n`)));
}

main()
  .catch(err => {
    console.error(red("\nErro fatal:"), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

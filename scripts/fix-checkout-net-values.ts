/**
 * Corrige registros financeiros gerados antes da separação grossValue/netValue.
 *
 * Problema: o webhook antigo usava paidAmountCents (valor bruto cobrado pelo
 * gateway, com taxas) para preencher Sale.totalAmount, Installment.amount e
 * FinancialTx.amount. O valor correto é amountCents (preço líquido do serviço).
 *
 * Critério de identificação:
 *   CheckoutSession com paidAmountCents != amountCents e Sale.netValue IS NULL
 *
 * Modo simulação (padrão — nada é alterado):
 *   npx tsx scripts/fix-checkout-net-values.ts
 *
 * Execução real:
 *   CONFIRM_FIX_CHECKOUT_NET=true npx tsx scripts/fix-checkout-net-values.ts
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIRM = process.env.CONFIRM_FIX_CHECKOUT_NET === "true";

// ─── Prisma ───────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const line = (c = "─", n = 70) => c.repeat(n);
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red  = (s: string) => `\x1b[31m${s}\x1b[0m`;
const grn  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yel  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim  = (s: string) => `\x1b[2m${s}\x1b[0m`;
const brl  = (v: number) => `R$${v.toFixed(2).replace(".", ",")}`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + line("═") + "\n" + bold("  CORRIGIR VALORES BRUTOS → LÍQUIDOS (CHECKOUT INFINITEPAY)") + "\n" + line("═"));
  console.log(dim(`  Modo: ${CONFIRM ? red("🔴 EXECUÇÃO REAL — dados serão alterados") : yel("🟡 SIMULAÇÃO — nenhum dado será alterado")}`));
  console.log("");

  // 1. Busca sessões com saleId e paidAmountCents preenchidos
  const sessions = await prisma.checkoutSession.findMany({
    where: {
      saleId: { not: null },
      paidAmountCents: { not: null },
    },
    select: {
      id: true,
      token: true,
      saleId: true,
      amountCents: true,
      paidAmountCents: true,
    },
  });

  // 2. Filtra: grossValue diferente do netValue
  const candidates = sessions.filter(
    (s) => s.paidAmountCents !== s.amountCents,
  );

  if (candidates.length === 0) {
    console.log(grn("Nenhum registro precisando correção encontrado."));
    console.log("");
    return;
  }

  // 3. Busca as Sales e verifica netValue IS NULL
  const saleIds = candidates.map((s) => s.saleId!);
  const sales = await prisma.sale.findMany({
    where: { id: { in: saleIds }, netValue: null },
    include: {
      installments: {
        include: { financialTx: { select: { id: true, amount: true } } },
      },
      invoiceIssues: { select: { id: true, amount: true, status: true } },
    },
  });

  if (sales.length === 0) {
    console.log(grn("Todos os registros já foram corrigidos (netValue preenchido)."));
    console.log("");
    return;
  }

  // Mapeia saleId → session para acessar amountCents / paidAmountCents
  const sessionBySaleId = new Map(candidates.map((s) => [s.saleId!, s]));

  const toFix = sales.map((sale) => ({
    sale,
    session: sessionBySaleId.get(sale.id)!,
  }));

  console.log(bold(`Registros a corrigir: ${toFix.length}\n`));

  for (const { sale, session } of toFix) {
    const netValue   = session.amountCents / 100;
    const grossValue = session.paidAmountCents! / 100;

    console.log(`  ${bold("▸")} ${sale.description}`);
    console.log(dim(`    Sale ID       : ${sale.id}`));
    console.log(dim(`    Session token : ${session.token}`));
    console.log(`    ${yel("Valor cobrado")} (grossValue) : ${brl(grossValue)}`);
    console.log(`    ${grn("Valor serviço")} (netValue)   : ${brl(netValue)}`);
    console.log(`    Sale.totalAmount atual        : ${brl(sale.totalAmount)}`);

    for (const inst of sale.installments) {
      console.log(dim(`    Parcela ${inst.number}: amount ${brl(inst.amount)} → ${brl(netValue)}`));
      if (inst.financialTx) {
        console.log(dim(`      FinancialTx: amount ${brl(inst.financialTx.amount)} → ${brl(netValue)}`));
      }
    }

    const invoicesToFix = sale.invoiceIssues.filter(
      (inv) => inv.status !== "issued" && inv.status !== "cancelled",
    );
    for (const inv of invoicesToFix) {
      console.log(dim(`    InvoiceIssue [${inv.status}]: amount ${brl(inv.amount)} → ${brl(netValue)}`));
    }
    if (sale.invoiceIssues.some((i) => i.status === "issued")) {
      console.log(yel(`    ⚠ InvoiceIssue já emitida — amount NÃO será alterado`));
    }

    console.log("");
  }

  console.log(line());

  if (!CONFIRM) {
    console.log(yel("\nNenhum dado foi alterado (modo simulação)."));
    console.log("\nPara aplicar as correções:");
    console.log(bold("  CONFIRM_FIX_CHECKOUT_NET=true npx tsx scripts/fix-checkout-net-values.ts"));
    console.log("");
    return;
  }

  // ─── Execução real ────────────────────────────────────────────────────────

  console.log("\n" + bold("Aplicando correções...\n"));

  let fixed  = 0;
  let failed = 0;

  for (const { sale, session } of toFix) {
    const netValue   = session.amountCents / 100;
    const grossValue = session.paidAmountCents! / 100;

    process.stdout.write(`  ${sale.description}... `);

    try {
      await prisma.$transaction(async (tx) => {
        // Sale
        await tx.sale.update({
          where: { id: sale.id },
          data: { totalAmount: netValue, netValue, grossValue },
        });

        // Installments e suas FinancialTxs
        for (const inst of sale.installments) {
          await tx.installment.update({
            where: { id: inst.id },
            data: { amount: netValue, netValue },
          });
          await tx.financialTx.updateMany({
            where: { installmentId: inst.id },
            data: { amount: netValue },
          });
        }

        // InvoiceIssues não emitidas
        const notIssuedIds = sale.invoiceIssues
          .filter((i) => i.status !== "issued" && i.status !== "cancelled")
          .map((i) => i.id);

        if (notIssuedIds.length > 0) {
          await tx.invoiceIssue.updateMany({
            where: { id: { in: notIssuedIds } },
            data: { amount: netValue },
          });
        }
      });

      fixed++;
      process.stdout.write(grn("ok\n"));
    } catch (err) {
      failed++;
      process.stdout.write(red("ERRO\n"));
      console.error(red(`    ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  console.log("\n" + line("═"));
  console.log(`  ✓ Corrigidos : ${fixed} de ${toFix.length}`);
  if (failed > 0) console.log(red(`  ✗ Com erro   : ${failed}`));
  console.log(line("═"));
  console.log(
    fixed === toFix.length
      ? grn(bold("\n  ✅ Valores corrigidos com sucesso.\n"))
      : red(bold(`\n  ⚠️  ${failed} registro(s) não foram corrigidos. Verifique os erros acima.\n`)),
  );
}

main()
  .catch((err) => {
    console.error(red("\nErro fatal:"), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

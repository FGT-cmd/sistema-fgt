import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export type InfinitePayWebhookBody = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
  return null;
}

/** Extrai order_nsu (ex.: checkout_TOKEN). */
export function extractOrderNsu(body: InfinitePayWebhookBody): string | null {
  return str(body.order_nsu) ?? str(body.orderNsu);
}

export function extractTransactionNsu(body: InfinitePayWebhookBody): string | null {
  return str(body.transaction_nsu) ?? str(body.transactionNsu);
}

export function extractReceiptUrl(body: InfinitePayWebhookBody): string | null {
  return str(body.receipt_url) ?? str(body.receiptUrl);
}

export function extractCaptureMethod(body: InfinitePayWebhookBody): string | null {
  return str(body.capture_method) ?? str(body.captureMethod);
}

export function extractPaidAmountCents(body: InfinitePayWebhookBody): number | null {
  return num(body.paid_amount) ?? num(body.paidAmount) ?? num(body.amount);
}

export function isPaidWebhook(body: InfinitePayWebhookBody): boolean {
  if (body.paid === false) return false;
  if (body.paid === true) return true;
  if (body.status === "paid" || body.status === "approved") return true;
  return true;
}

function derivePlanExpiresAt(productName: string, from: Date): Date | null {
  const name = productName.toLowerCase();
  const d = new Date(from);
  if (name.includes("trimestral")) { d.setMonth(d.getMonth() + 3); return d; }
  if (name.includes("semestral"))  { d.setMonth(d.getMonth() + 6); return d; }
  if (name.includes("anual"))      { d.setMonth(d.getMonth() + 12); return d; }
  return null;
}

async function createStudentJourneyIfNeeded(opts: {
  clientId: string;
  checkoutSessionId: string;
  saleId: string | null;
  productName: string;
  planStartDate: Date;
}): Promise<void> {
  const existing = await prisma.studentJourney.findUnique({ where: { clientId: opts.clientId } });
  if (existing) return;
  await prisma.studentJourney.create({
    data: {
      clientId: opts.clientId,
      checkoutSessionId: opts.checkoutSessionId,
      saleId: opts.saleId ?? null,
      stage: "alunos_novos",
      currentCycleNumber: 1,
      cycleLengthWeeks: 5,
      planStartDate: opts.planStartDate,
      planExpiresAt: derivePlanExpiresAt(opts.productName, opts.planStartDate),
      isPaused: false,
    },
  });
}

/** Forma de pagamento alinhada ao restante do sistema. */
export function mapCaptureMethodToPaymentMethod(capture: string | null): string {
  const c = (capture ?? "").toLowerCase().replace(/-/g, "_");
  if (c === "pix") return "pix";
  if (c === "credit_card" || c === "creditcard") return "cartão";
  if (c === "debit_card" || c === "debitcard") return "débito";
  if (c === "boleto") return "boleto";
  if (capture?.trim()) return capture.trim();
  return "InfinitePay";
}

export type WebhookProcessResult =
  | { kind: "ok"; idempotent?: boolean }
  | { kind: "ignored"; reason: string }
  | { kind: "error"; httpStatus: number; message: string };

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type FinancialChainResult = { saleId: string; financialTxId: string };

async function createFinancialChain(
  tx: PrismaTx,
  opts: {
    sessionId: string;
    clientId: string;
    productName: string;
    totalAmount: number;
    paidAt: Date;
    paymentMethod: string;
    orderNsu: string;
  },
): Promise<FinancialChainResult> {
  const sale = await tx.sale.create({
    data: {
      description: opts.productName,
      totalAmount: opts.totalAmount,
      installmentsCount: 1,
      paymentMethod: opts.paymentMethod,
      negotiationType: opts.paymentMethod,
      status: "ativo",
      clientId: opts.clientId,
    },
  });

  const installment = await tx.installment.create({
    data: {
      number: 1,
      amount: opts.totalAmount,
      dueDate: opts.paidAt,
      paidAt: opts.paidAt,
      status: "pago",
      label: "Parcela única",
      saleId: sale.id,
    },
  });

  const ftx = await tx.financialTx.create({
    data: {
      type: "receita",
      description: opts.productName,
      amount: opts.totalAmount,
      category: "Consultoria",
      status: "pago",
      dueDate: opts.paidAt,
      paidAt: opts.paidAt,
      paymentMethod: opts.paymentMethod,
      clientId: opts.clientId,
      installmentId: installment.id,
    },
  });

  await tx.checkoutSession.update({
    where: { id: opts.sessionId },
    data: { saleId: sale.id },
  });

  return { saleId: sale.id, financialTxId: ftx.id };
}

export async function processInfinitePayWebhook(
  body: InfinitePayWebhookBody,
): Promise<WebhookProcessResult> {
  if (!isPaidWebhook(body)) {
    return { kind: "ignored", reason: "not_paid" };
  }

  const orderNsu = extractOrderNsu(body);
  if (!orderNsu) {
    return { kind: "error", httpStatus: 400, message: "order_nsu ausente." };
  }

  const session = await prisma.checkoutSession.findFirst({
    where: { infinitepayOrderNsu: orderNsu },
  });

  if (!session) {
    return { kind: "ignored", reason: "session_not_found" };
  }

  // ─── Sessão já paga: caminho de reparo ────────────────────────────────────
  if (session.status === "paid") {
    const captureMethod = extractCaptureMethod(body);
    const paymentMethod = mapCaptureMethodToPaymentMethod(captureMethod);

    // Reparo 1: clientId ausente
    let resolvedClientId = session.clientId;
    if (!resolvedClientId) {
      const customerName = session.customerName?.trim();
      if (!customerName) {
        return { kind: "ok", idempotent: true };
      }

      const user = await getDefaultUser();
      const conditions: Prisma.ClientWhereInput[] = [];
      if (session.customerEmail?.trim()) conditions.push({ email: session.customerEmail.trim() });
      if (session.customerCpf?.trim()) conditions.push({ cpf: session.customerCpf.trim() });

      const existing = conditions.length > 0
        ? await prisma.client.findFirst({ where: { OR: conditions } })
        : null;

      if (existing) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.checkoutSession.update({ where: { id: session.id }, data: { clientId: existing.id } });
            if (!existing.paymentMethod) {
              await tx.client.update({ where: { id: existing.id }, data: { paymentMethod } });
            }
          });
        } catch (e: unknown) {
          // P2002 = unique constraint — client já vinculado a outra sessão
          if ((e as { code?: string }).code === "P2002") {
            if (!existing.paymentMethod) {
              await prisma.client.update({ where: { id: existing.id }, data: { paymentMethod } });
            }
          } else {
            throw e;
          }
        }
        resolvedClientId = existing.id;
      } else {
        await prisma.$transaction(async (tx) => {
          const client = await tx.client.create({
            data: {
              name: customerName,
              email: session.customerEmail?.trim() || null,
              phone: session.customerPhone?.trim() || null,
              cpf: session.customerCpf?.trim() || null,
              status: "ativo",
              source: "checkout_infinitepay",
              planName: session.productName,
              planDetails: `Checkout InfinitePay · order_nsu: ${orderNsu}`,
              paymentMethod,
              notes: `Criada automaticamente após pagamento (checkout token ${session.token}).`,
              tags: [],
              userId: user.id,
            },
          });
          await tx.checkoutSession.update({ where: { id: session.id }, data: { clientId: client.id } });
          resolvedClientId = client.id;
        });
      }
    } else {
      // Reparo 2: paymentMethod ausente no client existente
      const client = await prisma.client.findUnique({ where: { id: resolvedClientId } });
      if (client && !client.paymentMethod) {
        await prisma.client.update({ where: { id: client.id }, data: { paymentMethod } });
      }
    }

    if (!resolvedClientId) {
      return { kind: "ok", idempotent: true };
    }

    // Reparo 3: registros financeiros ausentes
    let resolvedSaleId: string | null = session.saleId;
    if (!session.saleId) {
      const totalAmount = (session.paidAmountCents ?? session.amountCents) / 100;
      const paidAt = session.paidAt ?? new Date();

      const chainResult = await prisma.$transaction(async (tx) => {
        return createFinancialChain(tx, {
          sessionId: session.id,
          clientId: resolvedClientId!,
          productName: session.productName,
          totalAmount,
          paidAt,
          paymentMethod,
          orderNsu,
        });
      });
      resolvedSaleId = chainResult.saleId;

      // Criar InvoiceIssue se ainda não existir para esta sessão
      const existingInvoice = await prisma.invoiceIssue.findFirst({
        where: { checkoutSessionId: session.id },
      });
      if (!existingInvoice) {
        await prisma.invoiceIssue.create({
          data: {
            clientId:          resolvedClientId!,
            saleId:            chainResult.saleId,
            checkoutSessionId: session.id,
            financialTxId:     chainResult.financialTxId,
            documentType:      "nfse",
            status:            "ready",
            serviceDescription: session.productName,
            amount:            totalAmount,
            taxpayerName:      session.customerName?.trim() || "",
            taxpayerCpfCnpj:   session.customerCpf?.trim()   || null,
            taxpayerEmail:     session.customerEmail?.trim()  || null,
            taxpayerPhone:     session.customerPhone?.trim()  || null,
            externalProvider:  "notasy",
          },
        });
      }
    }

    await createStudentJourneyIfNeeded({
      clientId: resolvedClientId!,
      checkoutSessionId: session.id,
      saleId: resolvedSaleId,
      productName: session.productName,
      planStartDate: session.paidAt ?? new Date(),
    });

    return { kind: "ok", idempotent: true };
  }

  // ─── Sessão ainda não paga: caminho principal ─────────────────────────────
  if (session.status === "pending_customer_data") {
    return { kind: "error", httpStatus: 409, message: "checkout_incomplete" };
  }

  const txNsu = extractTransactionNsu(body);
  const receiptUrl = extractReceiptUrl(body);
  const captureMethod = extractCaptureMethod(body);
  const paidAmountCents = extractPaidAmountCents(body);
  const paymentMethod = mapCaptureMethodToPaymentMethod(captureMethod);
  const paidAt = new Date();
  const payloadJson = body as Prisma.InputJsonValue;

  const customerName = session.customerName?.trim();
  if (!customerName) {
    return { kind: "error", httpStatus: 409, message: "missing_customer_name" };
  }

  const user = await getDefaultUser();
  const totalAmount = (paidAmountCents ?? session.amountCents) / 100;
  let idempotentRace = false;
  let capturedClientId: string | null = null;
  let capturedSaleId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.checkoutSession.updateMany({
      where: { id: session.id, status: { not: "paid" } },
      data: {
        status: "paid",
        infinitepayTransactionNsu: txNsu ?? null,
        infinitepayReceiptUrl: receiptUrl ?? null,
        infinitepayCaptureMethod: captureMethod ?? null,
        paidAmountCents: paidAmountCents ?? null,
        paidAt,
        webhookPayload: payloadJson,
      },
    });

    if (claimed.count === 0) {
      const other = await tx.checkoutSession.findUnique({ where: { id: session.id } });
      if (other?.status === "paid") {
        idempotentRace = true;
        return;
      }
      throw new Error("checkout_race_unresolved");
    }

    const fresh = await tx.checkoutSession.findUnique({ where: { id: session.id } });
    if (!fresh) throw new Error("session_missing");

    // Garantir client
    let resolvedClientId: string;
    if (fresh.clientId) {
      await tx.client.update({ where: { id: fresh.clientId }, data: { paymentMethod } });
      resolvedClientId = fresh.clientId;
    } else {
      const client = await tx.client.create({
        data: {
          name: customerName,
          email: session.customerEmail?.trim() || null,
          phone: session.customerPhone?.trim() || null,
          cpf: session.customerCpf?.trim() || null,
          status: "ativo",
          source: "checkout_infinitepay",
          planName: session.productName,
          planDetails: `Checkout InfinitePay · order_nsu: ${orderNsu}`,
          paymentMethod,
          notes: `Criada automaticamente após pagamento (checkout token ${session.token}).`,
          tags: [],
          userId: user.id,
        },
      });
      await tx.checkoutSession.update({ where: { id: fresh.id }, data: { clientId: client.id } });
      resolvedClientId = client.id;
    }

    // Criar registros financeiros e controle fiscal
    const { saleId, financialTxId } = await createFinancialChain(tx, {
      sessionId: fresh.id,
      clientId: resolvedClientId,
      productName: session.productName,
      totalAmount,
      paidAt,
      paymentMethod,
      orderNsu,
    });

    capturedClientId = resolvedClientId;
    capturedSaleId = saleId;

    await tx.invoiceIssue.create({
      data: {
        clientId:          resolvedClientId,
        saleId,
        checkoutSessionId: fresh.id,
        financialTxId,
        documentType:      "nfse",
        status:            "ready",
        serviceDescription: session.productName,
        amount:            totalAmount,
        taxpayerName:      customerName,
        taxpayerCpfCnpj:   session.customerCpf?.trim()   || null,
        taxpayerEmail:     session.customerEmail?.trim()  || null,
        taxpayerPhone:     session.customerPhone?.trim()  || null,
        externalProvider:  "notasy",
      },
    });
  });

  if (idempotentRace) {
    return { kind: "ok", idempotent: true };
  }

  if (capturedClientId) {
    await createStudentJourneyIfNeeded({
      clientId: capturedClientId,
      checkoutSessionId: session.id,
      saleId: capturedSaleId,
      productName: session.productName,
      planStartDate: paidAt,
    });
  }

  return { kind: "ok" };
}

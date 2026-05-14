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
): Promise<void> {
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
  console.log("[checkout-webhook] Sale criada id:", sale.id);

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
  console.log("[checkout-webhook] Installment criada id:", installment.id);

  await tx.financialTx.create({
    data: {
      type: "entrada",
      description: opts.productName,
      amount: opts.totalAmount,
      category: "vendas",
      status: "pago",
      dueDate: opts.paidAt,
      paidAt: opts.paidAt,
      paymentMethod: opts.paymentMethod,
      clientId: opts.clientId,
      installmentId: installment.id,
    },
  });
  console.log("[checkout-webhook] FinancialTx criada");

  await tx.checkoutSession.update({
    where: { id: opts.sessionId },
    data: { saleId: sale.id },
  });
  console.log("[checkout-webhook] CheckoutSession.saleId vinculado:", sale.id);
}

export async function processInfinitePayWebhook(
  body: InfinitePayWebhookBody,
): Promise<WebhookProcessResult> {
  const paidFlag = isPaidWebhook(body);
  console.log("[checkout-webhook] isPaidWebhook:", paidFlag);
  if (!paidFlag) {
    console.log("[checkout-webhook] evento ignorado — motivo: not_paid");
    return { kind: "ignored", reason: "not_paid" };
  }

  const orderNsu = extractOrderNsu(body);
  console.log("[checkout-webhook] order_nsu extraído:", orderNsu);
  if (!orderNsu) {
    return { kind: "error", httpStatus: 400, message: "order_nsu ausente." };
  }

  const session = await prisma.checkoutSession.findFirst({
    where: { infinitepayOrderNsu: orderNsu },
  });

  console.log(
    "[checkout-webhook] CheckoutSession encontrada:",
    session ? `id=${session.id} token=${session.token}` : "NÃO ENCONTRADA",
  );

  if (!session) {
    console.log("[checkout-webhook] evento ignorado — motivo: session_not_found (order_nsu:", orderNsu, ")");
    return { kind: "ignored", reason: "session_not_found" };
  }

  console.log("[checkout-webhook] status atual da sessão:", session.status, "saleId:", session.saleId);

  // ─── Sessão já paga: caminho de reparo ────────────────────────────────────
  if (session.status === "paid") {
    console.log("[checkout-webhook] sessão já está paid — verificando consistência");

    const captureMethod = extractCaptureMethod(body);
    const paymentMethod = mapCaptureMethodToPaymentMethod(captureMethod);

    // Reparo 1: clientId ausente
    let resolvedClientId = session.clientId;
    if (!resolvedClientId) {
      console.log("[checkout-webhook] [reparação] clientId ausente — tentando criar ou vincular client");

      const customerName = session.customerName?.trim();
      if (!customerName) {
        console.log("[checkout-webhook] [reparação] customerName vazio — impossível criar client");
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
        console.log("[checkout-webhook] [reparação] client existente encontrado id:", existing.id, "— vinculando");
        try {
          await prisma.$transaction(async (tx) => {
            await tx.checkoutSession.update({ where: { id: session.id }, data: { clientId: existing.id } });
            if (!existing.paymentMethod) {
              console.log("[checkout-webhook] [reparação] preenchendo paymentMethod no client id:", existing.id);
              await tx.client.update({ where: { id: existing.id }, data: { paymentMethod } });
            }
          });
        } catch (e: unknown) {
          // P2002 = unique constraint — client já vinculado a outra sessão
          if ((e as { code?: string }).code === "P2002") {
            console.log("[checkout-webhook] [reparação] client já vinculado a outra sessão — apenas reparando paymentMethod");
            if (!existing.paymentMethod) {
              await prisma.client.update({ where: { id: existing.id }, data: { paymentMethod } });
            }
          } else {
            throw e;
          }
        }
        resolvedClientId = existing.id;
      } else {
        console.log("[checkout-webhook] [reparação] nenhum client encontrado — criando novo para:", customerName);
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
          console.log("[checkout-webhook] [reparação] client criado id:", client.id, "— vinculando à sessão");
          await tx.checkoutSession.update({ where: { id: session.id }, data: { clientId: client.id } });
          resolvedClientId = client.id;
        });
      }
    } else {
      // Reparo 2: paymentMethod ausente no client existente
      const client = await prisma.client.findUnique({ where: { id: resolvedClientId } });
      if (client && !client.paymentMethod) {
        console.log("[checkout-webhook] [reparação] paymentMethod ausente no client id:", client.id, "— preenchendo:", paymentMethod);
        await prisma.client.update({ where: { id: client.id }, data: { paymentMethod } });
      }
    }

    if (!resolvedClientId) {
      console.log("[checkout-webhook] [reparação] sem clientId resolvido — não é possível criar financeiro");
      return { kind: "ok", idempotent: true };
    }

    // Reparo 3: registros financeiros ausentes
    if (!session.saleId) {
      console.log("[checkout-webhook] [reparação] saleId ausente — criando registros financeiros");
      const totalAmount = (session.paidAmountCents ?? session.amountCents) / 100;
      const paidAt = session.paidAt ?? new Date();

      await prisma.$transaction(async (tx) => {
        await createFinancialChain(tx, {
          sessionId: session.id,
          clientId: resolvedClientId!,
          productName: session.productName,
          totalAmount,
          paidAt,
          paymentMethod,
          orderNsu,
        });
      });
    } else {
      console.log("[checkout-webhook] saleId já presente:", session.saleId, "— financeiro consistente");
    }

    console.log("[checkout-webhook] idempotente — reparo concluído ou estado já consistente");
    return { kind: "ok", idempotent: true };
  }

  // ─── Sessão ainda não paga: caminho principal ─────────────────────────────
  if (session.status === "pending_customer_data") {
    console.log("[checkout-webhook] erro — sessão incompleta (pending_customer_data)");
    return { kind: "error", httpStatus: 409, message: "checkout_incomplete" };
  }

  const txNsu = extractTransactionNsu(body);
  const receiptUrl = extractReceiptUrl(body);
  const captureMethod = extractCaptureMethod(body);
  const paidAmountCents = extractPaidAmountCents(body);
  const paymentMethod = mapCaptureMethodToPaymentMethod(captureMethod);
  const paidAt = new Date();
  const payloadJson = body as Prisma.InputJsonValue;

  console.log("[checkout-webhook] dados extraídos:", { txNsu, captureMethod, paymentMethod, paidAmountCents });

  const customerName = session.customerName?.trim();
  if (!customerName) {
    console.log("[checkout-webhook] erro — customerName ausente na sessão id:", session.id);
    return { kind: "error", httpStatus: 409, message: "missing_customer_name" };
  }

  const user = await getDefaultUser();
  const totalAmount = (paidAmountCents ?? session.amountCents) / 100;
  let idempotentRace = false;

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

    console.log("[checkout-webhook] tentativa de marcar sessão como paid — claimed.count:", claimed.count);

    if (claimed.count === 0) {
      const other = await tx.checkoutSession.findUnique({ where: { id: session.id } });
      if (other?.status === "paid") {
        console.log("[checkout-webhook] race condition resolvida — já está paid");
        idempotentRace = true;
        return;
      }
      throw new Error("checkout_race_unresolved");
    }

    console.log("[checkout-webhook] sessão atualizada: status", session.status, "→ paid");

    const fresh = await tx.checkoutSession.findUnique({ where: { id: session.id } });
    if (!fresh) throw new Error("session_missing");

    // Garantir client
    let resolvedClientId: string;
    if (fresh.clientId) {
      console.log("[checkout-webhook] client reutilizado id:", fresh.clientId, "— atualizando paymentMethod para:", paymentMethod);
      await tx.client.update({ where: { id: fresh.clientId }, data: { paymentMethod } });
      resolvedClientId = fresh.clientId;
    } else {
      console.log("[checkout-webhook] criando novo client para:", customerName);
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
      console.log("[checkout-webhook] client criado id:", client.id, "— vinculando à sessão");
      await tx.checkoutSession.update({ where: { id: fresh.id }, data: { clientId: client.id } });
      resolvedClientId = client.id;
    }

    // Criar registros financeiros
    console.log("[checkout-webhook] criando registros financeiros — totalAmount:", totalAmount, "paymentMethod:", paymentMethod);
    await createFinancialChain(tx, {
      sessionId: fresh.id,
      clientId: resolvedClientId,
      productName: session.productName,
      totalAmount,
      paidAt,
      paymentMethod,
      orderNsu,
    });
  });

  if (idempotentRace) {
    return { kind: "ok", idempotent: true };
  }

  return { kind: "ok" };
}

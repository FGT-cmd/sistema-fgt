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

  console.log("[checkout-webhook] CheckoutSession encontrada:", session ? `id=${session.id} token=${session.token}` : "NÃO ENCONTRADA");

  if (!session) {
    console.log("[checkout-webhook] evento ignorado — motivo: session_not_found (order_nsu:", orderNsu, ")");
    return { kind: "ignored", reason: "session_not_found" };
  }

  console.log("[checkout-webhook] status atual da sessão:", session.status);

  if (session.status === "paid") {
    console.log("[checkout-webhook] idempotente — sessão já estava paga");
    return { kind: "ok", idempotent: true };
  }

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

    if (fresh.clientId) {
      console.log("[checkout-webhook] client reutilizado id:", fresh.clientId, "— atualizando paymentMethod para:", paymentMethod);
      await tx.client.update({
        where: { id: fresh.clientId },
        data: { paymentMethod },
      });
      return;
    }

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
    await tx.checkoutSession.update({
      where: { id: fresh.id },
      data: { clientId: client.id },
    });
  });

  if (idempotentRace) {
    return { kind: "ok", idempotent: true };
  }

  return { kind: "ok" };
}

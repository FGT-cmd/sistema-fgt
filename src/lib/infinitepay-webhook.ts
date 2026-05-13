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

  if (session.status === "paid") {
    return { kind: "ok", idempotent: true };
  }

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

    if (fresh.clientId) {
      await tx.client.update({
        where: { id: fresh.clientId },
        data: { paymentMethod },
      });
      return;
    }

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

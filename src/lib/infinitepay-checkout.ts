import type { Prisma } from "@prisma/client";

const DEFAULT_API_URL = "https://api.checkout.infinitepay.io/links";

export type InfinitePayCreateLinkInput = {
  handle: string;
  orderNsu: string;
  redirectUrl: string;
  webhookUrl?: string;
  items: { quantity: number; price: number; description: string }[];
  customer: {
    name: string;
    email: string;
    phone_number: string;
    document?: string;
  };
};

export type InfinitePayCreateLinkResult = {
  checkoutUrl: string;
  slug?: string;
  raw: Prisma.InputJsonValue;
};

function stripHandle(h: string): string {
  return h.replace(/^\$/, "").trim();
}

function extractCheckoutUrl(raw: Record<string, unknown>): string | null {
  if (typeof raw.checkout_url === "string" && raw.checkout_url) return raw.checkout_url;
  if (typeof raw.link === "string" && raw.link) return raw.link;
  if (typeof raw.url === "string" && raw.url) return raw.url;
  return null;
}

function extractErrorMessage(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  if (typeof o.message === "string") return o.message;
  const err = o.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: string }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}

/**
 * Cria link de checkout hospedado na InfinitePay.
 * @see https://api.checkout.infinitepay.io/links (payload pode usar `items`; alguns ambientes aceitam `itens`)
 */
export async function createInfinitePayCheckoutLink(
  input: InfinitePayCreateLinkInput,
): Promise<InfinitePayCreateLinkResult> {
  const apiUrl = process.env.INFINITEPAY_CHECKOUT_API_URL?.trim() || DEFAULT_API_URL;
  const handle = stripHandle(input.handle);
  if (!handle) {
    throw new Error("InfinitePay: handle ausente ou inválido.");
  }

  const body: Record<string, unknown> = {
    handle,
    items: input.items,
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      phone_number: input.customer.phone_number,
      ...(input.customer.document ? { document: input.customer.document } : {}),
    },
  };
  if (input.webhookUrl?.trim()) {
    body.webhook_url = input.webhookUrl.trim();
  }

  let res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  let raw: unknown = await res.json().catch(() => ({}));

  // Alguns ambientes InfinitePay esperam `itens` em vez de `items`
  if (!res.ok && res.status === 400) {
    const { items, ...rest } = body as { items: unknown[] } & Record<string, unknown>;
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...rest, itens: items }),
    });
    raw = await res.json().catch(() => ({}));
  }

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (!res.ok) {
    const detail = extractErrorMessage(obj) || res.statusText || `HTTP ${res.status}`;
    throw new Error(`InfinitePay: ${detail}`);
  }

  const checkoutUrl = extractCheckoutUrl(obj);
  if (!checkoutUrl) {
    throw new Error("InfinitePay: resposta sem URL de checkout.");
  }

  const slug = typeof obj.slug === "string" ? obj.slug : undefined;
  return { checkoutUrl, slug, raw: raw as Prisma.InputJsonValue };
}

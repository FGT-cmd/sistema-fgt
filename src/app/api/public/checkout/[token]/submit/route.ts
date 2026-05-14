import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPublicBaseUrl,
  isValidCpfDigits,
  isValidEmail,
  onlyDigits,
} from "@/lib/checkout-session";
import { createInfinitePayCheckoutLink } from "@/lib/infinitepay-checkout";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

function toE164Br(phoneDigits: string): string {
  const d = onlyDigits(phoneDigits);
  if (d.startsWith("55") && d.length >= 12) return `+${d}`;
  return `+55${d}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await ctx.params;
    const token = rawToken?.trim();
    if (!token) {
      return badRequest("Token inválido.");
    }

    const session = await prisma.checkoutSession.findUnique({ where: { token } });
    if (!session) {
      return NextResponse.json({ ok: false, message: "Sessão não encontrada." }, { status: 404 });
    }

    const handle = process.env.INFINITEPAY_HANDLE?.trim();
    if (!handle) {
      return NextResponse.json(
        { ok: false, message: "Pagamento temporariamente indisponível. Tente novamente mais tarde." },
        { status: 503 },
      );
    }

    if (session.infinitepayCheckoutUrl) {
      return NextResponse.json({
        ok: true,
        checkoutUrl: session.infinitepayCheckoutUrl,
        message: "Redirecionando para o pagamento.",
      });
    }

    let customerName: string;
    let customerEmail: string;
    let phoneDigits: string;
    let cpfDigits: string;

    if (session.status === "pending_customer_data") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return badRequest("Envie um objeto JSON com os dados.");
      }

      const b = body as Record<string, unknown>;
      customerName = typeof b.customerName === "string" ? b.customerName.trim() : "";
      customerEmail = typeof b.customerEmail === "string" ? b.customerEmail.trim() : "";
      const customerPhoneRaw = typeof b.customerPhone === "string" ? b.customerPhone.trim() : "";
      const customerCpfRaw = typeof b.customerCpf === "string" ? b.customerCpf.trim() : "";

      if (!customerName || customerName.length < 3) {
        return badRequest("Informe o nome completo (mínimo 3 caracteres).");
      }
      if (!isValidEmail(customerEmail)) {
        return badRequest("Informe um e-mail válido.");
      }

      phoneDigits = onlyDigits(customerPhoneRaw);
      if (phoneDigits.length < 10 || phoneDigits.length > 13) {
        return badRequest("Informe um telefone válido (DDD + número).");
      }

      cpfDigits = onlyDigits(customerCpfRaw);
      if (!isValidCpfDigits(cpfDigits)) {
        return badRequest("Informe um CPF válido (11 dígitos).");
      }
    } else if (session.status === "customer_data_completed") {
      customerName = session.customerName?.trim() ?? "";
      customerEmail = session.customerEmail?.trim() ?? "";
      phoneDigits = onlyDigits(session.customerPhone ?? "");
      cpfDigits = onlyDigits(session.customerCpf ?? "");
      if (!customerName || !customerEmail || !phoneDigits || !cpfDigits) {
        return badRequest("Sessão incompleta. Abra o link original do checkout.");
      }
    } else {
      return NextResponse.json(
        { ok: false, message: "Este link não está mais disponível." },
        { status: 409 },
      );
    }

    const base = getPublicBaseUrl();
    const orderNsu = `checkout_${token}`;
    const redirectUrl = `${base}/checkout/${encodeURIComponent(token)}?from=infinitepay`;
    const webhookUrl = `${base}/api/webhooks/infinitepay`;

    console.log("[checkout-submit] payload para InfinitePay:", {
      handle,
      orderNsu,
      redirectUrl,
      webhookUrl,
      productName: session.productName,
      amountCents: session.amountCents,
    });

    const ip = await createInfinitePayCheckoutLink({
      handle,
      orderNsu,
      redirectUrl,
      webhookUrl,
      items: [
        {
          quantity: 1,
          price: session.amountCents,
          description: session.productName,
        },
      ],
      customer: {
        name: customerName,
        email: customerEmail,
        phone_number: toE164Br(phoneDigits),
        document: cpfDigits,
      },
    });

    console.log("[checkout-submit] resposta InfinitePay:", {
      checkoutUrl: ip.checkoutUrl,
      slug: ip.slug,
    });

    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        ...(session.status === "pending_customer_data"
          ? {
              customerName,
              customerEmail,
              customerPhone: phoneDigits,
              customerCpf: cpfDigits,
              status: "customer_data_completed",
            }
          : {}),
        infinitepayOrderNsu: orderNsu,
        infinitepayCheckoutUrl: ip.checkoutUrl,
        infinitepaySlug: ip.slug ?? null,
        infinitepayRawResponse: ip.raw,
      },
    });

    return NextResponse.json({
      ok: true,
      checkoutUrl: ip.checkoutUrl,
      message: "Redirecionando para o pagamento seguro.",
    });
  } catch (err) {
    console.error("[POST /api/public/checkout/submit]", err);
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json(
      { ok: false, message: msg.includes("InfinitePay") ? msg : `Não foi possível iniciar o pagamento: ${msg}` },
      { status: 502 },
    );
  }
}

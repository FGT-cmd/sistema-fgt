import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isValidCpfDigits,
  isValidEmail,
  onlyDigits,
} from "@/lib/checkout-session";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
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

    if (session.status !== "pending_customer_data") {
      return NextResponse.json(
        { ok: false, message: "Este link já foi utilizado ou não está mais disponível." },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return badRequest("Envie um objeto JSON com os dados.");
    }

    const b = body as Record<string, unknown>;
    const customerName = typeof b.customerName === "string" ? b.customerName.trim() : "";
    const customerEmail = typeof b.customerEmail === "string" ? b.customerEmail.trim() : "";
    const customerPhoneRaw = typeof b.customerPhone === "string" ? b.customerPhone.trim() : "";
    const customerCpfRaw = typeof b.customerCpf === "string" ? b.customerCpf.trim() : "";

    if (!customerName || customerName.length < 3) {
      return badRequest("Informe o nome completo (mínimo 3 caracteres).");
    }
    if (!isValidEmail(customerEmail)) {
      return badRequest("Informe um e-mail válido.");
    }

    const phoneDigits = onlyDigits(customerPhoneRaw);
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      return badRequest("Informe um telefone válido (DDD + número).");
    }

    const cpfDigits = onlyDigits(customerCpfRaw);
    if (!isValidCpfDigits(cpfDigits)) {
      return badRequest("Informe um CPF válido (11 dígitos).");
    }

    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        customerName,
        customerEmail,
        customerPhone: phoneDigits,
        customerCpf: cpfDigits,
        status: "customer_data_completed",
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Dados recebidos com sucesso. Em breve você receberá as instruções de pagamento.",
    });
  } catch (err) {
    console.error("[POST /api/public/checkout/submit]", err);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar seus dados. Tente novamente." },
      { status: 500 },
    );
  }
}

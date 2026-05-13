import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatAmountBrl,
  generateCheckoutToken,
  getPublicBaseUrl,
} from "@/lib/checkout-session";

function badRequest(text: string) {
  return NextResponse.json({ text, url: "", token: "" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.OP_INTERNAL_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { text: "Serviço operacional não configurado (OP_INTERNAL_SECRET).", url: "", token: "" },
        { status: 503 },
      );
    }

    const auth = req.headers.get("authorization");
    const tokenAuth = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!tokenAuth || tokenAuth !== secret) {
      return NextResponse.json(
        { text: "Credencial operacional inválida ou ausente.", url: "", token: "" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return badRequest("Corpo da requisição deve ser um objeto.");
    }

    const b = body as Record<string, unknown>;
    const productName = typeof b.productName === "string" ? b.productName.trim() : "";
    const amountRaw = b.amountCents;
    const notes = typeof b.notes === "string" ? b.notes.trim() : undefined;
    const source =
      typeof b.source === "string" && b.source.trim() ? b.source.trim() : "telegram";

    if (!productName) {
      return badRequest('Campo "productName" obrigatório.');
    }
    if (typeof amountRaw !== "number" || !Number.isInteger(amountRaw) || amountRaw < 1) {
      return badRequest('Campo "amountCents" obrigatório (inteiro em centavos, mínimo 1).');
    }

    const base = getPublicBaseUrl();
    let checkoutToken = "";
    let createdId = "";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      checkoutToken = generateCheckoutToken();
      try {
        const row = await prisma.checkoutSession.create({
          data: {
            token: checkoutToken,
            productName,
            amountCents: amountRaw,
            notes: notes || null,
            source,
            status: "pending_customer_data",
          },
        });
        createdId = row.id;
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          continue;
        }
        throw e;
      }
    }

    if (!createdId) {
      return NextResponse.json(
        { text: "Não foi possível gerar token único. Tente novamente.", url: "", token: "" },
        { status: 500 },
      );
    }

    const url = `${base}/checkout/${checkoutToken}`;
    const valor = formatAmountBrl(amountRaw);
    const text =
      `Link gerado!\n\n` +
      `📦 Produto: ${productName}\n` +
      `💰 Valor: ${valor}\n\n` +
      `🔗 Link:\n${url}\n\n` +
      `Copie e envie ao cliente.`;

    return NextResponse.json({ text, url, token: checkoutToken });
  } catch (err) {
    console.error("[POST /api/op/checkout/create]", err);
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json(
      { text: `Falha ao criar checkout: ${msg}`, url: "", token: "" },
      { status: 500 },
    );
  }
}

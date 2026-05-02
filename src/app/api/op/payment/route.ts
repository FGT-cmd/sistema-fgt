import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

type PaymentMethod = "pix" | "cartao" | "boleto" | "dinheiro" | "transferencia";

type ParsedPayment = {
  studentName: string;
  amount: number;
  method: PaymentMethod;
};

const METHOD_ALIASES: Record<string, PaymentMethod> = {
  pix: "pix",
  cartao: "cartao",
  cartão: "cartao",
  boleto: "boleto",
  dinheiro: "dinheiro",
  transferencia: "transferencia",
  transferência: "transferencia",
  ted: "transferencia",
};

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.trim();
  if (!/^[\d.,]+$/.test(cleaned)) return null;

  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parsePayment(rawText: string): ParsedPayment | { error: string } {
  const text = rawText.trim();
  if (!text) return { error: "Comando vazio." };

  const patterns = [
    /^(.+?)\s+pagou\s+([\d.,]+)\s+(?:no|na|em)\s+([a-zA-ZÀ-ÿ]+)$/i,
    /^pagamento\s+(.+?)\s+([a-zA-ZÀ-ÿ]+)\s+([\d.,]+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let studentName = "";
    let rawAmount = "";
    let rawMethod = "";

    if (pattern === patterns[0]) {
      studentName = match[1] ?? "";
      rawAmount = match[2] ?? "";
      rawMethod = match[3] ?? "";
    } else {
      studentName = match[1] ?? "";
      rawMethod = match[2] ?? "";
      rawAmount = match[3] ?? "";
    }

    const amount = parseAmount(rawAmount);
    if (!amount) {
      return { error: `Valor inválido: "${rawAmount}".` };
    }

    const method = METHOD_ALIASES[normalizeText(rawMethod)];
    if (!method) {
      return {
        error: `Método de pagamento inválido: "${rawMethod}". Use pix, cartão, boleto, dinheiro ou transferência.`,
      };
    }

    const cleanedName = studentName.trim();
    if (!cleanedName || cleanedName.length < 3) {
      return { error: "Nome da aluna inválido no comando." };
    }

    return { studentName: cleanedName, amount, method };
  }

  return {
    error:
      'Formato inválido. Exemplos: "Camila Hepfner pagou 300 no pix" ou "pagamento Camila Hepfner pix 300".',
  };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const matrix = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= n; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[m][n];
}

function scoreName(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);

  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.93;

  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  const commonTokens = qTokens.filter((t) => cTokens.includes(t)).length;
  const tokenScore = qTokens.length ? commonTokens / qTokens.length : 0;

  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length) || 1;
  const levScore = 1 - dist / maxLen;

  return tokenScore * 0.6 + levScore * 0.4;
}

function formatMethod(method: PaymentMethod): string {
  switch (method) {
    case "cartao":
      return "cartão";
    case "transferencia":
      return "transferência";
    default:
      return method;
  }
}

export async function POST(req: NextRequest) {
  try {
    const opInternalSecret = process.env.OP_INTERNAL_SECRET;
    if (!opInternalSecret) {
      return NextResponse.json(
        { text: "Integração operacional não configurada no servidor (OP_INTERNAL_SECRET)." },
        { status: 500 },
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token || token !== opInternalSecret) {
      return NextResponse.json({ text: "Não autorizado." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const rawText = typeof body?.rawText === "string" ? body.rawText : "";
    if (!rawText) {
      return NextResponse.json(
        { text: 'Payload inválido. Envie JSON no formato: { "rawText": "..." }' },
        { status: 400 },
      );
    }

    const parsed = parsePayment(rawText);
    if ("error" in parsed) {
      return NextResponse.json({ text: parsed.error }, { status: 400 });
    }

    const user = await getDefaultUser();
    const clients = await prisma.client.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        { text: "Nenhuma aluna cadastrada para realizar o pagamento." },
        { status: 404 },
      );
    }

    const ranked = clients
      .map((client) => ({ client, score: scoreName(parsed.studentName, client.name) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];
    const MIN_SCORE = 0.82;
    const MIN_GAP = 0.08;

    if (!best || best.score < MIN_SCORE) {
      return NextResponse.json(
        { text: `Não encontrei aluna compatível com "${parsed.studentName}".` },
        { status: 404 },
      );
    }

    if (second && best.score - second.score < MIN_GAP) {
      return NextResponse.json(
        {
          text: `Ambiguidade no nome "${parsed.studentName}". Possíveis alunas: ${best.client.name} e ${second.client.name}.`,
        },
        { status: 409 },
      );
    }

    const pendingInstallments = await prisma.installment.findMany({
      where: { sale: { clientId: best.client.id }, status: "pendente" },
      include: {
        sale: { select: { id: true, installmentsCount: true } },
      },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    });

    if (pendingInstallments.length === 0) {
      return NextResponse.json(
        { text: `A aluna ${best.client.name} não possui parcelas pendentes.` },
        { status: 409 },
      );
    }

    const amountMatches = pendingInstallments.filter((inst) => Math.abs(inst.amount - parsed.amount) < 0.01);

    if (amountMatches.length === 0) {
      return NextResponse.json(
        {
          text: `Valor ${parsed.amount} não corresponde a nenhuma parcela pendente de ${best.client.name}.`,
        },
        { status: 409 },
      );
    }

    if (amountMatches.length > 1) {
      return NextResponse.json(
        {
          text: `Há mais de uma parcela pendente de ${best.client.name} com valor ${parsed.amount}. Não registrei para evitar erro.`,
        },
        { status: 409 },
      );
    }

    const installment = amountMatches[0];
    const now = new Date();

    await prisma.$transaction([
      prisma.installment.update({
        where: { id: installment.id },
        data: {
          status: "pago",
          paidAt: now,
          notes: `Pago via operação Telegram (${formatMethod(parsed.method)}).`,
        },
      }),
      prisma.financialTx.create({
        data: {
          type: "receita",
          description: `Pagamento ${best.client.name} - parcela ${installment.number}/${installment.sale.installmentsCount}`,
          amount: parsed.amount,
          category: "consultoria",
          status: "pago",
          paidAt: now,
          paymentMethod: formatMethod(parsed.method),
          clientId: best.client.id,
        },
      }),
    ]);

    return NextResponse.json({
      text: `Pagamento registrado: ${best.client.name}, R$ ${parsed.amount.toFixed(2)}, ${formatMethod(parsed.method)}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha ao registrar pagamento: ${msg}` }, { status: 500 });
  }
}

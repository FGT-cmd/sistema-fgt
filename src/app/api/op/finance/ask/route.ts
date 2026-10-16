import { NextRequest, NextResponse } from "next/server";
import { isOpAuthorized } from "@/lib/opAuth";
import { answerFinanceQuestion } from "@/lib/financeiro/ask/answer";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!isOpAuthorized(req)) {
    return NextResponse.json({ text: "Não autorizado." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const pergunta = typeof body?.pergunta === "string" ? body.pergunta.trim() : "";
  if (!pergunta) {
    return NextResponse.json({ text: 'Payload inválido. Envie { "pergunta": "..." }.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ text: await answerFinanceQuestion(pergunta) });
  } catch (err) {
    console.error("[POST /api/op/finance/ask]", err);
    return NextResponse.json({ text: "Não consegui consultar o financeiro agora." }, { status: 500 });
  }
}

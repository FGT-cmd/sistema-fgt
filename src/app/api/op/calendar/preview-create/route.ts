import { NextRequest, NextResponse } from "next/server";
import { parseOpCalendarPreview } from "@/lib/op-calendar-preview-parse";

function badRequest(text: string) {
  return NextResponse.json({ text }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.OP_INTERNAL_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { text: "Serviço operacional não configurado (OP_INTERNAL_SECRET)." },
        { status: 503 },
      );
    }

    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || token !== secret) {
      return NextResponse.json({ text: "Credencial operacional inválida ou ausente." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("JSON inválido no corpo da requisição.");
    }

    if (!body || typeof body !== "object") {
      return badRequest("Corpo da requisição deve ser um objeto.");
    }

    const rawText = typeof (body as { rawText?: unknown }).rawText === "string"
      ? (body as { rawText: string }).rawText.trim()
      : "";
    if (!rawText) {
      return badRequest('Envie JSON no formato: { "rawText": "..." }');
    }

    const parsed = parseOpCalendarPreview(rawText);
    if (!parsed.ok) {
      return NextResponse.json({ text: parsed.text });
    }

    return NextResponse.json({ text: parsed.text, payload: parsed.payload });
  } catch (err) {
    console.error("[POST /api/op/calendar/preview-create]", err);
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha na prévia: ${msg}` }, { status: 500 });
  }
}

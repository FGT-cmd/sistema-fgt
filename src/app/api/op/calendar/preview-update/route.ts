import { NextRequest, NextResponse } from "next/server";
import { parseOpCalendarUpdatePreview } from "@/lib/op-calendar-preview-update-parse";
import { resolveEventByTitleForUpdate } from "@/lib/op-calendar-update-resolver";

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

    const body = await req.json().catch(() => null);
    const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
    if (!rawText) {
      return badRequest('Envie JSON no formato: { "rawText": "..." }');
    }

    const parsed = parseOpCalendarUpdatePreview(rawText);
    if (!parsed.ok) {
      return NextResponse.json({ text: parsed.text });
    }

    const resolved = await resolveEventByTitleForUpdate(parsed.payload.queryTitle);
    if (!resolved.ok) {
      return NextResponse.json({ text: resolved.text });
    }

    const startMs = new Date(parsed.payload.start).getTime();
    const endMs = startMs + resolved.durationMs;
    const payload = {
      eventId: resolved.event.id,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      timezone: parsed.payload.timezone,
    };

    return NextResponse.json({
      text: `Prévia de remarcação pronta para "${resolved.event.summary}".`,
      payload,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha na prévia de remarcação: ${msg}` }, { status: 500 });
  }
}

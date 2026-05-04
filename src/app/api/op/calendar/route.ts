import { NextRequest, NextResponse } from "next/server";
import {
  formatEventsAsTelegramText,
  isOpCalendarRange,
  listCalendarEventsReadonly,
  resolveOperationalRange,
} from "@/lib/google-calendar-read";

export async function GET(req: NextRequest) {
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

    const raw = req.nextUrl.searchParams.get("range") ?? "today";
    if (!isOpCalendarRange(raw)) {
      return NextResponse.json(
        {
          text: `Parâmetro range inválido: "${raw}". Use: today, tomorrow ou tomorrow_morning.`,
        },
        { status: 400 },
      );
    }

    const window = resolveOperationalRange(raw);
    const listed = await listCalendarEventsReadonly(window.timeMin, window.timeMax);

    if (!listed.ok) {
      return NextResponse.json({ text: listed.message }, { status: 502 });
    }

    const text = formatEventsAsTelegramText(window.label, listed.events);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[GET /api/op/calendar]", err);
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha ao consultar a agenda: ${msg}` }, { status: 500 });
  }
}

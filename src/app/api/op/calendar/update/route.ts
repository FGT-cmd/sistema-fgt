import { NextRequest, NextResponse } from "next/server";
import { updateEventDateTime, type GoogleEvent } from "@/lib/google-calendar";

const DEFAULT_TZ = "America/Sao_Paulo";

function badRequest(text: string) {
  return NextResponse.json({ text }, { status: 400 });
}

function formatUpdatedEventForTelegram(ev: GoogleEvent, timeZone: string): string {
  const lines: string[] = [];
  lines.push(`✅ Evento remarcado: ${(ev.summary ?? "").trim() || "(sem título)"}`);
  const startIso = ev.start?.dateTime ?? "";
  const endIso = ev.end?.dateTime ?? "";
  if (startIso && endIso) {
    const df = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`📅 ${df.format(new Date(startIso))} → ${df.format(new Date(endIso))} (${timeZone})`);
  }
  if (ev.htmlLink) lines.push(`🔗 ${ev.htmlLink}`);
  return lines.join("\n");
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
    if (!body || typeof body !== "object") {
      return badRequest("Corpo da requisição deve ser um objeto.");
    }

    const b = body as Record<string, unknown>;
    const eventId = typeof b.eventId === "string" ? b.eventId.trim() : "";
    const startRaw = typeof b.start === "string" ? b.start.trim() : "";
    const endRaw = typeof b.end === "string" ? b.end.trim() : "";
    const timeZone = typeof b.timezone === "string" && b.timezone.trim() ? b.timezone.trim() : DEFAULT_TZ;

    if (!eventId) return badRequest('Campo "eventId" obrigatório.');
    if (!startRaw) return badRequest('Campo "start" obrigatório (data/hora ISO).');
    if (!endRaw) return badRequest('Campo "end" obrigatório (data/hora ISO).');

    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime())) return badRequest('Campo "start" inválido.');
    if (Number.isNaN(end.getTime())) return badRequest('Campo "end" inválido.');
    if (end.getTime() <= start.getTime()) return badRequest('Campo "end" deve ser depois de "start".');

    let updated: GoogleEvent | null;
    try {
      updated = await updateEventDateTime(
        {
          eventId,
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone,
        },
        { strictRefreshErrors: true, exposeCalendarApiErrors: true },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ text: `Agenda: ${msg}` }, { status: 502 });
    }

    if (!updated) {
      return NextResponse.json(
        {
          text:
            "Agenda: Google Agenda não está conectada. Conecte em Configurações / Agenda no sistema e tente de novo.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ text: formatUpdatedEventForTelegram(updated, timeZone) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha ao remarcar evento: ${msg}` }, { status: 500 });
  }
}

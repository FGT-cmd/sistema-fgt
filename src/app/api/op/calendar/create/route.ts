import { NextRequest, NextResponse } from "next/server";
import { createEvent, type GoogleEvent } from "@/lib/google-calendar";

const DEFAULT_TZ = "America/Sao_Paulo";

function badRequest(text: string) {
  return NextResponse.json({ text }, { status: 400 });
}

function formatCreatedEventForTelegram(ev: GoogleEvent, timeZone: string): string {
  const lines: string[] = [];
  lines.push(`✅ Evento criado: ${(ev.summary ?? "").trim() || "(sem título)"}`);
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
    lines.push(
      `📅 ${df.format(new Date(startIso))} → ${df.format(new Date(endIso))} (${timeZone})`,
    );
  }
  const desc = ev.description?.trim();
  if (desc) lines.push(desc);
  const loc = ev.location?.trim();
  if (loc) lines.push(`📍 ${loc}`);
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("JSON inválido no corpo da requisição.");
    }

    if (!body || typeof body !== "object") {
      return badRequest("Corpo da requisição deve ser um objeto.");
    }

    const b = body as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const startRaw = typeof b.start === "string" ? b.start.trim() : "";
    const endRaw = typeof b.end === "string" ? b.end.trim() : "";
    const tzRaw = typeof b.timezone === "string" ? b.timezone.trim() : "";
    const description = typeof b.description === "string" ? b.description : undefined;
    const location = typeof b.location === "string" ? b.location : undefined;

    if (!title) {
      return badRequest('Campo "title" obrigatório (string não vazia).');
    }
    if (!startRaw) {
      return badRequest('Campo "start" obrigatório (data/hora ISO).');
    }

    const startDate = new Date(startRaw);
    if (Number.isNaN(startDate.getTime())) {
      return badRequest('Campo "start" inválido: use uma data/hora ISO válida.');
    }

    let endDate: Date;
    if (endRaw) {
      endDate = new Date(endRaw);
      if (Number.isNaN(endDate.getTime())) {
        return badRequest('Campo "end" inválido: use uma data/hora ISO válida.');
      }
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }

    if (endDate.getTime() <= startDate.getTime()) {
      return badRequest('Campo "end" deve ser depois de "start".');
    }

    const timeZone = tzRaw || DEFAULT_TZ;
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    let created: GoogleEvent | null;
    try {
      created = await createEvent(
        {
          summary: title,
          start: startIso,
          end: endIso,
          timeZone,
          ...(description !== undefined ? { description } : {}),
          ...(location !== undefined ? { location } : {}),
        },
        { strictRefreshErrors: true, exposeCalendarApiErrors: true },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ text: `Agenda: ${msg}` }, { status: 502 });
    }

    if (!created) {
      return NextResponse.json(
        {
          text:
            "Agenda: Google Agenda não está conectada. Conecte em Configurações / Agenda no sistema e tente de novo.",
        },
        { status: 502 },
      );
    }

    const text = formatCreatedEventForTelegram(created, timeZone);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[POST /api/op/calendar/create]", err);
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha ao criar evento: ${msg}` }, { status: 500 });
  }
}

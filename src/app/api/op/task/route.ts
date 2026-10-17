import { after, NextRequest, NextResponse } from "next/server";
import { runTickTickSync } from "@/lib/ticktick/syncRunner";
import { createTask } from "@/lib/openclaw/actions";
import { getDefaultUser } from "@/lib/user";
import type { OCCreateTaskData, OCEnriched } from "@/lib/openclaw/types";

function unauthorized(msg: string) {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.OP_INTERNAL_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Serviço operacional não configurado (OP_INTERNAL_SECRET)." },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || token !== secret) {
    return unauthorized("Credencial operacional inválida ou ausente.");
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

  const { data, enriched } = body as {
    data?: unknown;
    enriched?: unknown;
  };

  if (!data || typeof data !== "object") {
    return badRequest("Campo data obrigatório.");
  }

  const d = data as OCCreateTaskData;
  if (typeof d.title !== "string" || !d.title.trim()) {
    return badRequest("Campo data.title obrigatório.");
  }

  const enr = (enriched && typeof enriched === "object" ? enriched : {}) as OCEnriched;

  const user = await getDefaultUser();

  try {
    const text = await createTask(d, enr, user.id);
    if (process.env.TICKTICK_SYNC_ENABLED === "true") after(async () => {
      try { await runTickTickSync(); } catch (err) { console.error("[op/task] ticktick", err); }
    });
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[POST /api/op/task]", err);
    return NextResponse.json(
      { error: "Falha ao criar tarefa no banco de dados." },
      { status: 500 },
    );
  }
}

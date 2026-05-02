import { NextRequest, NextResponse } from "next/server";
import { getDailyPendingSummary } from "@/lib/openclaw/actions";
import { getDefaultUser } from "@/lib/user";
import type { OCQueryType } from "@/lib/openclaw/types";

const QUERY_TYPES: OCQueryType[] = [
  "who_didnt_pay",
  "overdue",
  "today",
  "attention",
  "general",
];

function unauthorized(msg: string) {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function GET(req: NextRequest) {
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

  const user = await getDefaultUser();

  const raw = req.nextUrl.searchParams.get("queryType") ?? "general";
  if (!QUERY_TYPES.includes(raw as OCQueryType)) {
    return badRequest(`queryType inválido: ${raw}`);
  }
  const queryType = raw as OCQueryType;

  try {
    const text = await getDailyPendingSummary(user.id, queryType);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[GET /api/op/pending]", err);
    return NextResponse.json(
      { error: "Falha ao consultar pendências no banco de dados." },
      { status: 500 },
    );
  }
}

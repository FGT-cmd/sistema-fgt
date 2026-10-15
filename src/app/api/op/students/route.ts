import { NextRequest, NextResponse } from "next/server";
import { listStudents } from "@/lib/openclaw/actions";
import { getDefaultUser } from "@/lib/user";
import type { OCStudentsFilter } from "@/lib/openclaw/types";

function unauthorized(msg: string) {
  return NextResponse.json({ error: msg }, { status: 401 });
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

  const raw = req.nextUrl.searchParams.get("filter") ?? "ativos";
  const filter: OCStudentsFilter = raw === "todos" ? "todos" : "ativos";

  try {
    const text = await listStudents(user.id, filter);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[GET /api/op/students]", err);
    return NextResponse.json(
      { error: "Falha ao consultar alunos no banco de dados." },
      { status: 500 },
    );
  }
}

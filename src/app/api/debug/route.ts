import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  const db = process.env.DATABASE_URL;
  return NextResponse.json({
    anthropic: key ? `configurada (${key.length} chars, começa com: ${key.slice(0, 15)})` : "NÃO CONFIGURADA",
    database: db ? `configurada (${db.length} chars)` : "NÃO CONFIGURADA",
  });
}

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada" }, { status: 500 });

  const client = new Anthropic({ apiKey });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

  const text = await file.text();

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Você é um assistente financeiro. Analise este extrato bancário e retorne APENAS um JSON válido (sem markdown, sem explicações) com um array de transações no seguinte formato:

[
  {
    "date": "YYYY-MM-DD",
    "description": "descrição limpa e legível",
    "amount": 123.45,
    "type": "receita" ou "despesa",
    "category": "uma das categorias: Mensalidade, Consultoria, Marketing, Operacional, Pessoal, Equipamentos, Alimentação, Transporte, Plataformas, Impostos, Outros",
    "paymentMethod": "Pix, Débito, Crédito, Transferência ou Outro"
  }
]

Regras:
- Valores negativos = despesa, positivos = receita
- Ignore linhas de saldo, totais ou cabeçalhos
- Capitalize a descrição corretamente
- Se a descrição mencionar nome de aluno/pessoa e for crédito, categoria = "Mensalidade"

Extrato:
${text.slice(0, 8000)}`,
      },
    ],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const transactions = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return NextResponse.json({ transactions });
  } catch {
    return NextResponse.json({ error: "Não foi possível interpretar o extrato", raw }, { status: 422 });
  }
  } catch (err) {
    console.error("[POST /api/financeiro/extrato]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

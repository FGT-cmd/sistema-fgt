import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { texto, planName, paymentMethod } = await req.json();
    if (!texto?.trim()) return NextResponse.json({ error: "Texto vazio" }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);

    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: `Você é um assistente financeiro de uma consultoria fitness. Hoje é ${today}.
Analise a negociação descrita e retorne APENAS um JSON válido (sem markdown) com:
{
  "description": "descrição curta do plano/serviço",
  "totalAmount": número total em reais,
  "installments": número de parcelas (mínimo 1),
  "firstDueDate": "YYYY-MM-DD" da primeira parcela,
  "paymentMethod": "Pix" | "Crédito" | "Débito" | "Transferência" | "Boleto" | "Dinheiro",
  "summary": "resumo em 1 frase do que foi detectado"
}

Contexto: plano=${planName || "não informado"}, forma de pagamento preferida=${paymentMethod || "não informado"}.
Regras:
- Entenda "entrada" como 1ª parcela agora ou na data mencionada
- Entenda "restante em X dias" como próxima parcela nessa data
- Se mencionar "30D", some 30 dias à data de hoje
- Se houver valor de entrada + restante, calcule o total somando tudo
- Use o método de pagamento mencionado ou o do contexto`,
      messages: [{ role: "user", content: texto }],
    });

    const raw = (res.content[0] as { type: string; text: string }).text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "IA não retornou dados válidos" }, { status: 422 });

    return NextResponse.json(JSON.parse(match[0]));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

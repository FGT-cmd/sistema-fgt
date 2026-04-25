import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { texto, serviceValue, planName, paymentMethod } = await req.json();
    if (!texto?.trim()) return NextResponse.json({ error: "Texto vazio" }, { status: 400 });

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    function addDays(days: number) {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }

    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `Você é um assistente financeiro de uma consultoria fitness. Hoje é ${todayStr}.
Valor total do serviço: R$${serviceValue || "não informado"}.
Plano: ${planName || "não informado"}. Forma de pagamento preferida: ${paymentMethod || "não informado"}.

Analise a negociação e retorne APENAS um JSON válido (sem markdown):
{
  "customInstallments": [
    { "amount": número, "dueDate": "YYYY-MM-DD", "label": "Entrada" },
    { "amount": número, "dueDate": "YYYY-MM-DD", "label": "Reforço" }
  ],
  "totalAmount": número total,
  "paymentMethod": "Pix" | "Crédito" | "Débito" | "Transferência" | "Boleto" | "Dinheiro",
  "summary": "resumo curto do que foi detectado"
}

REGRAS CRÍTICAS:
- Crie UMA entrada em customInstallments para cada pagamento mencionado
- "hoje" = ${todayStr}
- "em X dias" ou "XD" = hoje + X dias (ex: "20 dias" = ${addDays(20)}, "45D" = ${addDays(45)})
- "restante" = valorTotal - soma das outras parcelas. Use o Valor total do serviço se informado
- Use os valores EXATOS mencionados — NUNCA divida igualmente
- Se mencionar só 1 forma de pagamento, use ela para todas as parcelas
- Se o valor total não for informado, some os valores explícitos das parcelas`,
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

// Loop de perguntas: o modelo escolhe as ferramentas de leitura e responde
// curto, só com o que elas devolveram.

import Anthropic from "@anthropic-ai/sdk";
import { getDefaultUser } from "@/lib/user";
import { FINANCE_MODELS } from "../capture/interpret";
import { loadAskData } from "./data";
import { ASK_TOOLS, runAskTool, type AskData } from "./tools";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 6;

function systemPrompt(today: string): string {
  return `Você responde perguntas do Fernando sobre o financeiro da consultoria FGT usando SOMENTE os dados das ferramentas. Nunca invente número.
Responda em português, curto (até 6 linhas), com valores no formato R$ 1.234,56 e datas dd/mm. A resposta pode ser lida em voz alta: frases diretas, sem tabela.
Saldo é sempre estimado: diga a data do extrato que serve de base. Se não houver extrato da conta, diga que precisa do extrato.
Hoje é ${today}. "Essa semana" vai até o próximo domingo.`;
}

export async function answerFinanceQuestion(pergunta: string): Promise<string> {
  const user = await getDefaultUser();
  return answerWithData(pergunta, await loadAskData(user.id));
}

// Separada para a avaliação rodar com dados sintéticos, sem banco.
export async function answerWithData(pergunta: string, data: AskData): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: pergunta }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model: FINANCE_MODELS.ask,
      max_tokens: 4000,
      system: systemPrompt(data.today),
      tools: ASK_TOOLS,
      output_config: { effort: "medium" },
      messages,
    });
    if (res.stop_reason === "refusal") return "Não consegui responder essa agora.";

    messages.push({ role: "assistant", content: res.content });
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "Não encontrei essa informação.";
    }

    messages.push({
      role: "user",
      content: toolUses.map((t) => ({
        type: "tool_result" as const,
        tool_use_id: t.id,
        content: JSON.stringify(runAskTool(t.name, t.input, data)),
      })),
    });
  }
  return "Essa ficou complexa demais. Tenta perguntar em partes.";
}

// Loop de perguntas: o modelo escolhe as ferramentas de leitura e responde
// curto, só com o que elas devolveram.

import Anthropic from "@anthropic-ai/sdk";
import { getDefaultUser } from "@/lib/user";
import { addDays } from "../dates";
import { FINANCE_MODELS } from "../capture/interpret";
import { loadAskData } from "./data";
import { ASK_TOOLS, runAskTool, type AskData } from "./tools";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TURNS = 6;
const FAIL_MSG = "Não consegui consultar o financeiro agora. Tenta de novo em instantes.";

function runToolSafe(name: string, input: unknown, data: AskData): { content: string; isError: boolean } {
  try {
    return { content: JSON.stringify(runAskTool(name, input, data)), isError: false };
  } catch (err) {
    console.error("[finance-ask] tool", name, err);
    return { content: JSON.stringify({ erro: String(err) }), isError: true };
  }
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function weekInfo(today: string) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDays(today, dow === 0 ? 0 : 7 - dow);
  return { weekday: WEEKDAYS[dow], sunday };
}

function systemPrompt(today: string): string {
  const { weekday, sunday } = weekInfo(today);
  return `Você responde perguntas do Fernando sobre o financeiro da consultoria FGT usando SOMENTE os dados das ferramentas. Nunca invente número.
Responda em português, curto (até 6 linhas), com valores no formato R$ 1.234,56 e datas dd/mm. A resposta pode ser lida em voz alta: frases diretas, sem tabela.
Texto puro: sem markdown, sem asteriscos, sem sublinhado, sem listas com hífen ou número; use frases corridas (pode separar itens com ponto e vírgula).
Saldo é sempre estimado: diga a data do extrato que serve de base. O saldo estimado já inclui os lançamentos depois do extrato. Se não houver extrato da conta, diga que precisa do extrato.
Hoje é ${weekday}, ${today}. "Essa semana" vai até domingo, ${sunday}.`;
}

export async function answerFinanceQuestion(pergunta: string): Promise<string> {
  try {
    const user = await getDefaultUser();
    return await answerWithData(pergunta, await loadAskData(user.id));
  } catch (err) {
    console.error("[finance-ask]", err);
    return FAIL_MSG;
  }
}

// Separada para a avaliação rodar com dados sintéticos, sem banco.
export async function answerWithData(pergunta: string, data: AskData): Promise<string> {
  try {
    return await runLoop(pergunta, data);
  } catch (err) {
    console.error("[finance-ask]", err);
    return FAIL_MSG;
  }
}

async function runLoop(pergunta: string, data: AskData): Promise<string> {
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
        .replace(/[*_`]/g, "")
        .trim();
      return text || "Não encontrei essa informação.";
    }

    messages.push({
      role: "user",
      content: toolUses.map((t) => {
        const r = runToolSafe(t.name, t.input, data);
        return { type: "tool_result" as const, tool_use_id: t.id, content: r.content, is_error: r.isError };
      }),
    });
  }
  return "Essa ficou complexa demais. Tenta perguntar em partes.";
}

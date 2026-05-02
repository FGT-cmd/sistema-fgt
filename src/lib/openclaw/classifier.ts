import Anthropic from "@anthropic-ai/sdk";
import type { OCClassification, OCIntent } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function classifyOCMessage(
  message: string,
  clientList: string,
  today: string,
): Promise<OCClassification> {
  const systemPrompt = `Você é o classificador de intenção do OpenClaw Assistant, assistente operacional para consultoria fitness.
Hoje é ${today}.

ALUNOS/CLIENTES CADASTRADOS: ${clientList || "Nenhum"}

Analise a mensagem e retorne APENAS um JSON válido (sem markdown):
{
  "intent": "<intent>",
  "data": { ... },
  "directResponse": "<resposta para queries — VAZIO para ações>"
}

INTENTS E CAMPOS:

query_pending → { "queryType": "who_didnt_pay" | "overdue" | "today" | "general" }
  - "quem não pagou" → who_didnt_pay
  - "atrasado/vencido" → overdue
  - "hoje/dia/pendências de alunos/pagamentos" → today ou general

query_crm → { "queryType": "pipeline" | "stuck" | "no_action" | "general" }
  - "pipeline/leads/CRM/funil" → pipeline
  - "leads parados/sem movimento/travado" → stuck
  - "sem ação/sem próxima ação/quem precisa de contato" → no_action
  - outros sobre CRM → general

create_student → { "name": string, "planName"?: string, "objective"?: string, "phone"?: string, "email"?: string }
  - qualquer "criar aluna", "cadastrar", "nova aluna", "adicionar aluna"
  - planName: extraia se mencionado ("semestral", "trimestral", "mensal", etc.)
  - objective: extraia se mencionado ("emagrecimento", "hipertrofia", "condicionamento", etc.)

create_lead → { "name": string, "title"?: string, "source"?: string, "value"?: number, "phone"?: string, "email"?: string, "objectives"?: string, "nextAction"?: string }
  - "novo lead", "criar lead", "lead de X", "X demonstrou interesse", "X quer contratar"
  - title: nome do deal (ex: "Consultoria Premium para Ana")
  - source: de onde veio (Instagram, WhatsApp, Indicação, etc.)
  - value: valor estimado se mencionado
  - nextAction: próxima ação se mencionada

register_payment → { "studentName": string, "amount": number, "paymentMethod": "Pix"|"Dinheiro"|"Cartão"|"Transferência"|"Débito"|"Crédito", "date"?: "YYYY-MM-DD" }
  - "X pagou Y no pix", "X quitou", "X efetuou pagamento"
  - date: hoje=${today}, amanhã, etc.

create_task → { "title": string, "dueDate"?: "YYYY-MM-DD", "studentName"?: string, "type"?: "general"|"student"|"financial"|"content"|"commercial"|"administrative" }
  - "lembrar", "criar tarefa", "me avisa", "anotar tarefa", "tarefa para"
  - datas naturais → YYYY-MM-DD

add_student_note → { "studentName": string, "note": string }
  - "observação de/da X: ...", "anota sobre X", "X disse/relatou/vai", "nota sobre X"
  - note: o conteúdo exato da observação

save_content_idea → { "idea": string }
  - "ideia de conteúdo", "salvar ideia", "ideia para post/reels/stories/vídeo"
  - idea: o texto da ideia, sem o prefixo

unknown → {}

REGRAS CRÍTICAS:
- Para create_student, create_lead, register_payment, create_task, add_student_note, save_content_idea: deixe directResponse VAZIO — o sistema gera a confirmação.
- Para query_pending e query_crm: preencha directResponse com texto útil (não será usado, o sistema responde diretamente).
- NUNCA invente nomes, valores ou datas. Use exatamente o que está escrito.
- Para datas: "hoje"=${today}, "amanhã"=dia seguinte, "sexta"=próxima sexta, etc. → YYYY-MM-DD.
- Se a mensagem pode ser create_student OU create_lead: se há menção de pagamento/plano → create_student. Se é apenas "fulano quer contratar/tem interesse" → create_lead.

NÃO É SUA FUNÇÃO — retorne intent "unknown" imediatamente se a mensagem:
- Pedir análise de arquivos, código-fonte, Google Drive ou documentação
- Pedir para "ver", "analisar", "revisar", "explicar" o sistema, arquitetura ou implementação
- Mencionar DATABASE_URL, variáveis de ambiente, configuração técnica
- Pedir relatório sobre código, módulos, rotas ou estrutura do projeto
- Pedir qualquer coisa que não seja operar o Sistema FGT (consultar dados, registrar, criar)
Você opera o sistema. Não analisa arquivos. Não lê documentação. Não explica código.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: message }],
  });

  const raw = (res.content[0] as { text: string }).text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude não retornou JSON válido");

  const parsed = JSON.parse(match[0]);
  return {
    intent: (parsed.intent || "unknown") as OCIntent,
    data: parsed.data || {},
    directResponse: parsed.directResponse || "",
  };
}

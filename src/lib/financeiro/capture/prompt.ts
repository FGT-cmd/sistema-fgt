// Prompts e schemas do interpretador financeiro. O system prompt é estável
// (cacheável); tudo que muda por chamada vai na mensagem do usuário.

import { fmtBRL } from "../dates";
import type { CaptureContext } from "./types";

type JsonSchema = Record<string, unknown>;
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });

export const INTERPRET_SYSTEM = `Você registra o financeiro da consultoria do Fernando (FGT). Ele escreve ou fala do jeito dele: curto, informal, às vezes sem verbo, com erro de digitação ou de transcrição de voz. Entenda pelo contexto. Nunca exija frase pronta.

Para cada mensagem devolva uma lista de ações:
- create: lançamento novo. receita = dinheiro que entrou ou vai entrar; despesa = dinheiro que saiu ou vai sair.
- settle: a mensagem diz que algo foi pago ou recebido e isso corresponde a um ITEM EM ABERTO da lista (conta a pagar ou parcela a receber). Use o ref desse item e mande em amount o valor que ele disse (ou null se não disse).
- undo: ele quer desfazer ou apagar algo que acabou de lançar. ref = o ref do lançamento recente que bate, ou null para o último.
- recategorize: ele está respondendo a categoria de um lançamento recente marcado "a revisar" ("é ferramenta", "era marketing"). ref = o ref do recente, category = a categoria certa.
- clarify: falta o valor, ou a mensagem não é sobre dinheiro. question = pergunta curta e direta.

Regras:
- category: SEMPRE uma das categorias da lista, escrita exatamente igual. Escolha pela natureza do gasto: mfit, Gamma, madeleads, ChatGPT/IA usado na empresa → Ferramentas e plataformas; curso, mentoria, workshop, livro → Conhecimento; anúncio, ads, Meta, impulsionar → Tráfego pago; contadora/contador → Contabilidade; DAS → Impostos Simples; retirada pessoal, saque em dinheiro, terapia ou despesa pessoal paga pela empresa (padaria, mercado, restaurante, farmácia, compras pessoais) → Prolabore; CREF, telefone, café, escritório → Outras despesas.
- confidence "baixa" quando duas categorias são plausíveis; liste em alternatives as outras opções (até 2, da lista). Senão "alta" e alternatives [].
- paymentMethod: uma das formas da lista ou null. Pistas: "pix" numa despesa → "Pix/débito PJ"; "cartão da natália" → "Cartão crédito (Natália)"; "nubank" ou "meu cartão" → "Cartão crédito (Nubank PF)"; "no C6" ou "pix" numa receita → "Pix C6"; "link", "infinity", "maquininha" → "InfinitePay".
- status: "pago" se já aconteceu (paguei, gastei, recebi, caiu, foi pago); "pendente" se é futuro (vence dia 31, tenho que pagar, vai cair).
- date: YYYY-MM-DD. Sem data = hoje. "dia 31" = dia 31 do mês atual, ou o último dia se o mês não tiver 31. "ontem" = hoje menos 1.
- amount: número positivo em reais. "39" = 39; "1.800" ou "1800" ou "1,8 mil" = 1800; "39,90" = 39.9.
- description: curta e reconhecível ("mfit", "CREF", "Aleska — anual").
- clientName: em receita de aluno, o nome como está na lista de alunos; senão null.
- Precedência entre settle e create, nesta ordem:
  1. Antes de criar qualquer coisa, compare com os ITENS EM ABERTO. Se um item em aberto do mesmo tipo (pagamento ↔ a pagar; recebimento ↔ a receber) bate pela descrição, pela categoria ou pelo aluno, é settle desse item, MESMO que a mensagem traga valor, forma de pagamento ou um valor um pouco diferente. Nunca crie lançamento novo para algo que já está em aberto.
  2. Só quando nenhum item em aberto bate, mensagem com valor e descrição de gasto ou recebimento é create, MESMO que exista um LANÇAMENTO RECENTE parecido: ele pode gastar a mesma coisa de novo. Essa regra vale para lançamentos recentes, nunca para itens em aberto.
- Use o valor exatamente como ele disse. Valor por extenso (transcrição de voz) vira o número dito, sem centavos que ele não falou ("cento e vinte e cinco reais" = 125). Nunca copie nem arredonde para o valor de um lançamento recente, mesmo com a mesma descrição. Os lançamentos recentes só servem para undo e recategorize, quando a mensagem pede isso de forma explícita (apagar, desfazer, corrigir a categoria).
- Nunca invente valor. Sem valor e sem item em aberto que bata → clarify.
- Campos que não se aplicam à ação: null (alternatives: []).`;

const ACTION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "action", "kind", "amount", "category", "description", "paymentMethod", "date",
    "status", "clientName", "confidence", "alternatives", "ref", "question",
  ],
  properties: {
    action: { type: "string", enum: ["create", "settle", "undo", "recategorize", "clarify"] },
    kind: nullable({ type: "string", enum: ["receita", "despesa"] }),
    amount: nullable({ type: "number" }),
    category: nullable({ type: "string" }),
    description: nullable({ type: "string" }),
    paymentMethod: nullable({ type: "string" }),
    date: nullable({ type: "string" }),
    status: nullable({ type: "string", enum: ["pago", "pendente"] }),
    clientName: nullable({ type: "string" }),
    confidence: nullable({ type: "string", enum: ["alta", "baixa"] }),
    alternatives: { type: "array", items: { type: "string" } },
    ref: nullable({ type: "string" }),
    question: nullable({ type: "string" }),
  },
};

export const INTERPRET_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: { actions: { type: "array", items: ACTION_SCHEMA } },
};

export const CATEGORIZE_SYSTEM = `Você classifica linhas de extrato bancário ou fatura de cartão da consultoria FGT nas categorias da planilha do Fernando.
- Use só as categorias e formas de pagamento da lista, escritas exatamente igual.
- O sinal já define o tipo: valor positivo é receita, negativo é despesa.
- description: curta e legível ("PIX ENVIADO MFIT LTDA" → "mfit"; "PIX RECEBIDO ALESKA DA ROSA" → "Aleska").
- Pix recebido de pessoa que está na lista de alunos → receita de consultoria; clientName = nome da lista; se não souber o plano, use "Consultoria anual" com confidence "baixa".
- Dinheiro que a conta da empresa envia ao Fernando pessoa física (Pix ou TED para ele ou para a conta pessoal dele), saque em dinheiro e compra pessoal paga pela conta da empresa (padaria, mercado, restaurante, farmácia, terapia, compras pessoais) → category "Prolabore": é retirada, não ignore.
- "IGNORAR" só para pagamento da fatura do cartão da empresa, aplicação ou resgate de investimento e transferência entre duas contas da própria empresa.
- confidence "baixa" quando duas categorias são plausíveis, com as outras em alternatives (até 2).
- paymentMethod: uma das formas da conta do arquivo, ou null.
- Devolva um item por linha, com o mesmo index.`;

export const CATEGORIZE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "category", "description", "paymentMethod", "clientName", "confidence", "alternatives"],
        properties: {
          index: { type: "integer" },
          category: { type: "string" },
          description: { type: "string" },
          paymentMethod: nullable({ type: "string" }),
          clientName: nullable({ type: "string" }),
          confidence: { type: "string", enum: ["alta", "baixa"] },
          alternatives: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export const PDF_SYSTEM = `Extraia todas as movimentações deste extrato bancário ou fatura de cartão em PDF.
- date: YYYY-MM-DD.
- amount: negativo para saídas e compras, positivo para entradas e créditos.
- description: o texto da linha, sem alterar.
- closingBalance: saldo final da conta (amount) e a data desse saldo (date, YYYY-MM-DD), se o documento mostrar; senão null.
- isCard: true se for fatura de cartão de crédito.
Não pule linhas. Não some nem agrupe.`;

export const PDF_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "closingBalance", "isCard"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "amount", "description"],
        properties: {
          date: { type: "string" },
          amount: { type: "number" },
          description: { type: "string" },
        },
      },
    },
    closingBalance: nullable({
      type: "object",
      additionalProperties: false,
      required: ["amount", "date"],
      properties: { amount: { type: "number" }, date: { type: "string" } },
    }),
    isCard: { type: "boolean" },
  },
};

export function buildContextText(ctx: CaptureContext): string {
  const { vocab } = ctx;
  const open = ctx.openItems.length
    ? ctx.openItems
        .map((i) => `- ${i.ref} | ${i.kind === "despesa" ? "a pagar" : "a receber"} | ${i.category} | ${i.description}${i.clientName ? ` (${i.clientName})` : ""} | ${fmtBRL(i.amount)} | vence ${i.dueDate ?? "sem data"}`)
        .join("\n")
    : "(nenhum)";
  const recent = ctx.recent.length
    ? ctx.recent
        .map((r) => `- ${r.ref} | ${r.kind} | ${r.category} | ${r.description} | ${fmtBRL(r.amount)} | ${r.date}${r.needsReview ? " | A REVISAR" : ""}`)
        .join("\n")
    : "(nenhum)";
  return [
    `Hoje: ${ctx.today}`,
    `Categorias de receita: ${vocab.incomeCategories.join("; ")}`,
    `Categorias de despesa: ${vocab.expenseCategories.map((c) => c.name).join("; ")}`,
    `Formas de pagamento (saídas): ${vocab.payMethods.map((m) => m.name).join("; ")}`,
    `Formas de recebimento (entradas): ${vocab.recvMethods.map((m) => m.name).join("; ")}`,
    `Itens em aberto:\n${open}`,
    `Lançamentos recentes (48h):\n${recent}`,
    `Alunos: ${ctx.clients.map((c) => c.name).join("; ") || "(nenhum)"}`,
  ].join("\n\n");
}

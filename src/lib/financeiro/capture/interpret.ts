// Chamadas ao Claude do financeiro. Saída sempre estruturada (JSON schema) e
// sempre validada por parse.ts antes de qualquer gravação.

import Anthropic from "@anthropic-ai/sdk";
import type { StatementRow } from "../dedupe";
import type { ParsedStatement } from "../statement";
import { methodsForAccount } from "../vocab";
import { fmtBRL, isValidIsoDate } from "../dates";
import {
  INTERPRET_SYSTEM, INTERPRET_SCHEMA, CATEGORIZE_SYSTEM, CATEGORIZE_SCHEMA, PDF_SYSTEM, PDF_SCHEMA,
  buildContextText,
} from "./prompt";
import { validateActions, validateCreate } from "./parse";
import type { CaptureAction, CaptureContext, RawAction, TxDraft } from "./types";

// Um modelo por tarefa. Padrão Haiku 5.5 (decisão de custo do Fernando).
// A tarefa que falhar em `npm run eval:finance` sobe para "claude-sonnet-5-5", só ela.
export const FINANCE_MODELS = {
  capture: "claude-haiku-5-5",    // interpretar texto/voz
  ask: "claude-haiku-5-5",        // responder perguntas (loop com ferramentas)
  categorize: "claude-haiku-5-5", // categorizar linhas de extrato
  document: "claude-haiku-5-5",   // ler foto de comprovante e extrato em PDF
} as const;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type InterpretInput =
  | { kind: "text"; text: string }
  | { kind: "image"; imageBase64: string; mimeType: ImageMime; caption: string | null };

export class InterpretError extends Error {}

async function structured<T>(params: {
  model: string;
  system: string;
  schema: Record<string, unknown>;
  content: Anthropic.ContentBlockParam[];
  maxTokens: number;
}): Promise<T> {
  const res = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.system,
    output_config: { effort: "low", format: { type: "json_schema", schema: params.schema } },
    messages: [{ role: "user", content: params.content }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
    throw new InterpretError(`stop_reason=${res.stop_reason}`);
  }
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!text) throw new InterpretError("resposta sem texto");
  return JSON.parse(text.text) as T;
}

export async function interpret(ctx: CaptureContext, input: InterpretInput): Promise<CaptureAction[]> {
  const contextText = `CONTEXTO\n${buildContextText(ctx)}`;
  const content: Anthropic.ContentBlockParam[] =
    input.kind === "text"
      ? [{ type: "text", text: `${contextText}\n\nMENSAGEM:\n${input.text}` }]
      : [
          { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.imageBase64 } },
          {
            type: "text",
            text: `${contextText}\n\nA imagem é um comprovante, nota ou boleto que o Fernando mandou para lançar.${input.caption ? ` Legenda dele: ${input.caption}` : ""}`,
          },
        ];
  const out = await structured<{ actions: RawAction[] }>({
    model: input.kind === "text" ? FINANCE_MODELS.capture : FINANCE_MODELS.document,
    system: INTERPRET_SYSTEM, schema: INTERPRET_SCHEMA, content, maxTokens: 4000,
  });
  return validateActions(out.actions ?? [], ctx);
}

type CategorizedItem = {
  index: number;
  category: string;
  description: string;
  paymentMethod: string | null;
  clientName: string | null;
  confidence: "alta" | "baixa";
  alternatives: string[];
};

const BATCH = 60;

export async function categorizeStatementRows(
  ctx: CaptureContext,
  rows: StatementRow[],
  account: string,
): Promise<{ drafts: TxDraft[]; ignored: number }> {
  const batches: StatementRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));

  const contextText = buildContextText({ ...ctx, openItems: [], recent: [] });
  const accountMethods = methodsForAccount(ctx.vocab, account);

  const results = await Promise.all(
    batches.map((batch) => {
      const lines = batch.map((r, i) => `${i} | ${r.date} | ${r.amount >= 0 ? "+" : "-"}${fmtBRL(Math.abs(r.amount))} | ${r.description}`);
      return structured<{ items: CategorizedItem[] }>({
        model: FINANCE_MODELS.categorize,
        system: CATEGORIZE_SYSTEM,
        schema: CATEGORIZE_SCHEMA,
        maxTokens: 16000,
        content: [{
          type: "text",
          text: `CONTEXTO\n${contextText}\n\nConta do arquivo: ${account}. Formas dessa conta: ${accountMethods.join("; ") || "(nenhuma cadastrada)"}\n\nLINHAS (index | data | valor | descrição):\n${lines.join("\n")}`,
        }],
      }).then((out) => ({ batch, items: out.items ?? [] }));
    }),
  );

  const drafts: TxDraft[] = [];
  let ignored = 0;
  for (const { batch, items } of results) {
    batch.forEach((row, i) => {
      const item = items.find((it) => it.index === i);
      if (item?.category === "IGNORAR") {
        ignored++;
        return;
      }
      const created = validateCreate({
        action: "create",
        kind: row.amount >= 0 ? "receita" : "despesa",
        amount: Math.abs(row.amount),
        category: item?.category ?? null,
        description: item?.description ?? row.description,
        paymentMethod: item?.paymentMethod ?? null,
        date: row.date,
        status: "pago",
        clientName: item?.clientName ?? null,
        confidence: item ? item.confidence : "baixa",
        alternatives: item?.alternatives ?? [],
        ref: null,
        question: null,
      }, ctx);
      if (created.action !== "create") return;
      const { action: _action, ...draft } = created; // eslint-disable-line @typescript-eslint/no-unused-vars
      drafts.push({ ...draft, needsReview: draft.needsReview || !item, externalId: row.externalId });
    });
  }
  return { drafts, ignored };
}

export async function extractPdfStatement(base64: string): Promise<ParsedStatement> {
  const out = await structured<{
    rows: { date: string; amount: number; description: string }[];
    closingBalance: { amount: number; date: string } | null;
    isCard: boolean;
  }>({
    model: FINANCE_MODELS.document,
    system: PDF_SYSTEM,
    schema: PDF_SCHEMA,
    maxTokens: 16000,
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Extraia as movimentações." },
    ],
  });
  return {
    rows: (out.rows ?? []).filter((r) => isValidIsoDate(r.date) && Number.isFinite(r.amount) && r.amount !== 0),
    ledgerBalance: out.closingBalance,
    isCard: !!out.isCard,
    invertSign: false,
  };
}

# Financeiro FGT — Plano 1: Captura e Perguntas (Telegram + Jarvis)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Fernando lança qualquer entrada/saída por texto, voz, foto ou extrato (Telegram e Jarvis) em linguagem livre, e pergunta "contas em aberto / saldo / o que pagar hoje" recebendo resposta com dados reais do sistema.

**Architecture:** Toda regra financeira vive em módulos puros e testados em `src/lib/financeiro/` (vocabulário, livro-razão, dedupe, recorrência, saldo, parsers de extrato, resumo). A interpretação de linguagem é uma chamada ao Claude com saída estruturada (JSON schema), validada por código antes de tocar no banco. Os módulos que falam com o banco (`*Loader.ts`, `setup.ts`, `capture/apply.ts`, `capture/run.ts`, `ask/data.ts`) são finos. O Telegram chama essas funções direto (mesmo app); o Jarvis chama as novas rotas `/api/op/finance/*`.

**Tech Stack:** Next.js 16 (App Router, `after()`), TypeScript, Prisma 7 + PostgreSQL (Neon), `@anthropic-ai/sdk` 0.90 (já instalado), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-15-financeiro-fgt-captura-e-planilha-design.md` (Partes 1, 3, 4, 5, 7 e 9). O Plano 2 (tela nova + importação jan/fev) vem depois.

## Global Constraints

- **Next.js 16 tem breaking changes.** Conforme `AGENTS.md`: consultar `node_modules/next/dist/docs/` antes de usar API do Next que não esteja mostrada neste plano.
- **Prisma: usar `npx prisma db push`, nunca `migrate dev`.** O schema já divergiu das migrations (registrado em `docs/superpowers/plans/2026-07-27-financeiro-flexivel.md`). Toda mudança de schema aqui é aditiva.
- **Após `prisma generate`, reiniciar o servidor de dev.**
- **O banco do `.env` é o de produção (Neon).** Nada de apagar ou alterar dado existente fora do que a task manda. Testes unitários nunca tocam no banco.
- **Módulos puros não importam `@/lib/prisma`.** Quem importa Prisma fica em arquivo separado (`*Loader.ts`, `setup.ts`, `apply.ts`, `run.ts`, `data.ts`, rotas).
- **Modelo do Claude, decidido com o Fernando:** **Haiku 5.5 (`claude-haiku-5-5`) em tudo**, com um modelo por tarefa no objeto `FINANCE_MODELS` (`capture`, `ask`, `categorize`, `document`). Regra de troca: a tarefa que falhar na bateria de avaliação (`npm run eval:finance`) passa a usar `claude-sonnet-5-5`, só ela; as outras ficam no Haiku. Não ajustar para Opus sem pedido explícito dele. Não usar `tool_choice` forçado (`any`/`tool`) nem `thinking: disabled`: usar saída estruturada (`output_config.format`) para JSON e `tool_choice` automático (padrão) no loop de perguntas, o que funciona igual em Haiku 5.5 e Sonnet 5.5. Sempre checar `stop_reason === "refusal"` antes de ler o conteúdo.
- **Linguagem livre, nunca match de frase** (memória `feedback_contexto_nao_frase_literal`). Não escrever regex para interpretar mensagens financeiras; quem interpreta é o modelo, o código só valida.
- **Datas:** strings `YYYY-MM-DD` no domínio; gravar no banco com `new Date(\`${iso}T12:00:00\`)` (padrão do projeto). "Hoje" é sempre em `America/Sao_Paulo`.
- **Vocabulário oficial** (Parte 1 da spec), gravado em `FinancialConfig`:
  - Receita: Consultoria semestral, Consultoria anual, Consultoria trimestral, Aulas presenciais.
  - Saída (grupo): Prolabore, Ferramentas e plataformas, Estagiário, Contabilidade, INSS (fixo) · Impostos Simples (variavel) · Taxa de antecipação, Outras despesas (despesa) · Tráfego pago, Equipamentos, Conhecimento, Marketing (investimento) · Distribuição Lucros, Reserva Financeira, Reserva de oportunidades (destinacao).
  - Pagamento (conta): Pix/débito PJ (C6), Cartão crédito (Nubank PF) (Nubank PF), Cartão crédito (Natália) (Cartão Natália), C6 (C6).
  - Recebimento (conta): InfinitePay (InfinitePay), Pix C6 (C6), Dinheiro (Dinheiro).
- **Idioma:** identificadores de código em inglês, exceto nomes de ferramentas do modelo/MCP (português, padrão do bridge). Textos ao usuário em português.
- **Commits frequentes**, um por task, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Ajustes à spec decididos neste plano (registrar na spec na Task 1)

1. `CapturePending` ganha `kind` (`confirm | question | undo | correction`) e não tem `userId` (sistema de um dono só; `chatId` fixo `"owner"`).
2. O interpretador ganha a ação `recategorize` (resposta a "é ferramenta" por voz) além de `create | settle | undo | clarify`.
3. Os dois crons mensais viram **um** slot `monthly` (dia 1, 09h BRT): lança os fixos e pede o extrato no mesmo aviso.
4. Linhas de extrato que são transferência entre contas próprias, pagamento de fatura ou aplicação/resgate são **ignoradas** (categoria `IGNORAR`), para não contar em dobro com a fatura do cartão.
5. Modelo: Haiku 5.5 em tudo, um modelo por tarefa; a tarefa que falhar na avaliação com frases reais sobe para Sonnet 5.5 (decisão do Fernando, 2026-10-16, por custo: ~R$5–20/mês contra ~R$100 com Opus).

---

## Mapa de arquivos

```
prisma/schema.prisma                         (modificar) campos novos + 4 modelos
vitest.config.ts                             (modificar) alias "@"
vitest.eval.config.ts                        (criar) suíte de avaliação com o modelo real
package.json                                 (modificar) script eval:finance

src/lib/financeiro/
  dates.ts            puro   hoje em SP, soma de dias, formatação BRL/dd/mm
  vocab.ts            puro   vocabulário, seed, grupos, contas
  setup.ts            banco  ensureFinanceSetup (seed idempotente)
  ledger.ts           puro   livro-razão unificado (lançamentos + caixa de vendas), regra de mês, itens em aberto
  ledgerLoader.ts     banco  loadLedger
  dedupe.ts           puro   linha de extrato × livro-razão
  recurring.ts        puro   fixos do mês + mensagem da virada do mês
  recurringRunner.ts  banco  generateRecurringForMonth
  balance.ts          puro   saldo estimado
  statement.ts        puro   OFX/CSV → linhas
  capture/
    types.ts          puro   tipos da captura
    prompt.ts         puro   prompts + JSON schemas
    parse.ts          puro   validação da saída do modelo
    summary.ts        puro   textos de resposta
    telegramUi.ts     puro   botões e callback_data
    interpret.ts      API    chamadas ao Claude (texto, imagem, extrato, PDF)
    context.ts        banco  monta o contexto do interpretador
    apply.ts          banco  grava, baixa, desfaz, pendências
    statementCapture.ts banco extrato → propostas
    run.ts            banco  orquestra captureText / captureImage
    callbacks.ts      banco  botões do Telegram
  ask/
    tools.ts          puro   ferramentas de leitura
    data.ts           banco  loadAskData
    answer.ts         API    loop de perguntas

src/lib/opAuth.ts                            (criar)
src/lib/telegram.ts                          (modificar) botões, callback, download de arquivo
src/lib/openclaw/types.ts                    (modificar) intents finance_*, buttons
src/lib/openclaw/classifier.ts               (modificar) intents finance_*
src/lib/openclaw/engine.ts                   (modificar) roteia finance_*
src/app/api/telegram/route.ts                (modificar) foto, arquivo, callback, after()
src/app/api/op/finance/capture/route.ts      (criar)
src/app/api/op/finance/ask/route.ts          (criar)
src/app/api/cron/jarvis/route.ts             (modificar) slot monthly
vercel.json                                  (modificar)

~/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge/server.js            (modificar, outro repo)
~/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge/test-financeiro.js   (criar, outro repo)
```

---

### Task 1: Schema, alias de testes, datas e vocabulário

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `vitest.config.ts`
- Modify: `docs/superpowers/specs/2026-10-15-financeiro-fgt-captura-e-planilha-design.md` (seção "Ajustes")
- Create: `src/lib/financeiro/dates.ts`, `src/lib/financeiro/dates.test.ts`
- Create: `src/lib/financeiro/vocab.ts`, `src/lib/financeiro/vocab.test.ts`
- Create: `src/lib/financeiro/setup.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `dates.ts`: `todaySaoPaulo(now?: Date): string`, `addDays(iso: string, days: number): string`, `daysBetween(a: string, b: string): number`, `toDbDate(iso: string): Date`, `isoDate(d: Date): string`, `fmtBRL(v: number): string`, `fmtDayMonth(iso: string): string`, `monthLabel(month: string): string` (ex. `"2026-10"` → `"outubro/2026"`), `round2(v: number): number`.
  - `vocab.ts`: tipos `ExpenseGroup`, `ConfigType`, `ConfigRow`, `NamedMethod`, `Vocab`, `SeedRecurringCost`; constantes `EXPENSE_GROUPS`, `SEED_INCOME_CATEGORIES`, `SEED_EXPENSE_CATEGORIES`, `SEED_PAY_METHODS`, `SEED_RECV_METHODS`, `SEED_RECURRING_COSTS`; funções `normalizeLabel(s)`, `matchLabel(options: string[], value: string | null | undefined): string | null`, `planSeed(rows: ConfigRow[])`, `buildVocab(rows: ConfigRow[]): Vocab`, `accountOfMethod(vocab, method): string | null`, `groupOfCategory(vocab, category): ExpenseGroup | null`, `accountsOf(vocab): string[]`, `methodsForAccount(vocab, account): string[]`.
  - `setup.ts`: `ensureFinanceSetup(userId: string): Promise<Vocab>`.
  - Prisma: campos `FinancialTx.source/needsReview/rawInput/externalId/recurringCostId`, `FinancialConfig.group/account`, modelos `FinancialBudget`, `RecurringCost`, `BankBalanceSnapshot`, `CapturePending`.

- [ ] **Step 1: Alias `@` no Vitest**

Substituir o conteúdo de `vitest.config.ts` por:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

Run: `npm test`
Expected: os testes existentes (`aggregates`, `receivables`, `saleTxs`, `saleInstallments`) continuam PASS.

- [ ] **Step 2: Escrever o teste de `dates.ts`**

Criar `src/lib/financeiro/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  todaySaoPaulo, addDays, daysBetween, isoDate, fmtBRL, fmtDayMonth, monthLabel, round2,
} from "./dates";

describe("dates", () => {
  it("hoje em São Paulo vira o dia anterior antes das 03h UTC", () => {
    expect(todaySaoPaulo(new Date("2026-10-16T02:30:00Z"))).toBe("2026-10-15");
    expect(todaySaoPaulo(new Date("2026-10-16T03:30:00Z"))).toBe("2026-10-16");
  });
  it("soma e diferença de dias atravessam o mês", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
    expect(daysBetween("2026-02-02", "2026-01-30")).toBe(3);
  });
  it("isoDate pega a data UTC", () => {
    expect(isoDate(new Date("2026-01-08T12:00:00Z"))).toBe("2026-01-08");
  });
  it("formata valores e datas em pt-BR", () => {
    expect(fmtBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(fmtDayMonth("2026-10-05")).toBe("05/10");
    expect(monthLabel("2026-10")).toBe("outubro/2026");
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/dates.test.ts`
Expected: FAIL com "Failed to resolve import ./dates".

- [ ] **Step 4: Implementar `dates.ts`**

Criar `src/lib/financeiro/dates.ts`:

```ts
// Utilidades de data e dinheiro do financeiro. Domínio usa strings YYYY-MM-DD;
// o banco recebe meio-dia local (padrão do projeto) para não virar o dia por fuso.

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function todaySaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const diff = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Math.round(Math.abs(diff) / 86_400_000);
}

export function toDbDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function fmtDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]}/${y}`;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/dates.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Escrever o teste de `vocab.ts`**

Criar `src/lib/financeiro/vocab.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  planSeed, buildVocab, accountOfMethod, groupOfCategory, matchLabel,
  accountsOf, methodsForAccount, type ConfigRow,
} from "./vocab";

function row(p: Partial<ConfigRow> & Pick<ConfigRow, "type" | "value">): ConfigRow {
  return { id: p.value, group: null, account: null, active: true, order: 0, ...p };
}

describe("planSeed", () => {
  it("cria todo o vocabulário num banco vazio", () => {
    const plan = planSeed([]);
    expect(plan.create).toHaveLength(26);
    expect(plan.update).toHaveLength(0);
    expect(plan.create.find((c) => c.value === "INSS")).toMatchObject({ type: "expense_cat", group: "fixo" });
    expect(plan.create.find((c) => c.value === "Pix C6")).toMatchObject({ type: "recv_method", account: "C6" });
  });

  it("não duplica item existente com outra grafia e completa o grupo que falta", () => {
    const plan = planSeed([row({ type: "expense_cat", value: "prolabore", id: "p1" })]);
    expect(plan.create.find((c) => c.value === "Prolabore")).toBeUndefined();
    expect(plan.update).toEqual([{ id: "p1", group: "fixo" }]);
  });

  it("não mexe em item que já tem grupo", () => {
    const plan = planSeed([row({ type: "expense_cat", value: "Prolabore", group: "despesa" })]);
    expect(plan.update).toEqual([]);
  });
});

describe("buildVocab", () => {
  const rows: ConfigRow[] = [
    row({ type: "income_cat", value: "Consultoria anual", order: 1 }),
    row({ type: "income_cat", value: "Consultoria semestral", order: 0 }),
    row({ type: "expense_cat", value: "Tráfego pago" }),
    row({ type: "expense_cat", value: "Categoria antiga", active: false }),
    row({ type: "expense_cat", value: "Mensalidade app" }),
    row({ type: "pay_method", value: "Cartão crédito (Natália)" }),
    row({ type: "recv_method", value: "Pix C6", account: "C6" }),
    row({ type: "goal", value: "35000" }),
  ];
  const vocab = buildVocab(rows);

  it("ordena, ignora inativos e itens que não são vocabulário", () => {
    expect(vocab.incomeCategories).toEqual(["Consultoria semestral", "Consultoria anual"]);
    expect(vocab.expenseCategories.map((c) => c.name)).toEqual(["Tráfego pago", "Mensalidade app"]);
  });

  it("usa o grupo do seed quando o banco não tem, e 'despesa' para categoria desconhecida", () => {
    expect(groupOfCategory(vocab, "tráfego PAGO")).toBe("investimento");
    expect(groupOfCategory(vocab, "Mensalidade app")).toBe("despesa");
    expect(groupOfCategory(vocab, "Não existe")).toBeNull();
  });

  it("resolve a conta de cada forma de pagamento", () => {
    expect(accountOfMethod(vocab, "cartao credito (natalia)")).toBe("Cartão Natália");
    expect(accountOfMethod(vocab, "Pix C6")).toBe("C6");
    expect(accountOfMethod(vocab, null)).toBeNull();
    expect(accountsOf(vocab)).toEqual(["Cartão Natália", "C6"]);
    expect(methodsForAccount(vocab, "C6")).toEqual(["Pix C6"]);
  });
});

describe("matchLabel", () => {
  it("casa ignorando acento, caixa e espaços extras", () => {
    expect(matchLabel(["Estagiário", "INSS"], "  estagiario ")).toBe("Estagiário");
    expect(matchLabel(["INSS"], "IRPF")).toBeNull();
    expect(matchLabel(["INSS"], null)).toBeNull();
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/vocab.test.ts`
Expected: FAIL com "Failed to resolve import ./vocab".

- [ ] **Step 8: Implementar `vocab.ts`**

Criar `src/lib/financeiro/vocab.ts`:

```ts
// Vocabulário financeiro oficial — vem da planilha "Painel Financeiro para Negócios".
// Única fonte de categorias, grupos da DRE e formas de pagamento/recebimento.
// Os valores ficam em FinancialConfig; este módulo semeia e interpreta.

export type ExpenseGroup = "fixo" | "variavel" | "despesa" | "investimento" | "destinacao";
export type ConfigType = "income_cat" | "expense_cat" | "pay_method" | "recv_method";

export type ConfigRow = {
  id: string;
  type: string;
  value: string;
  group: string | null;
  account: string | null;
  active: boolean;
  order: number;
};

export type NamedMethod = { name: string; account: string };

export type Vocab = {
  incomeCategories: string[];
  expenseCategories: { name: string; group: ExpenseGroup }[];
  payMethods: NamedMethod[];
  recvMethods: NamedMethod[];
};

export const EXPENSE_GROUPS: ExpenseGroup[] = ["fixo", "variavel", "despesa", "investimento", "destinacao"];

export const SEED_INCOME_CATEGORIES = [
  "Consultoria semestral",
  "Consultoria anual",
  "Consultoria trimestral",
  "Aulas presenciais",
];

export const SEED_EXPENSE_CATEGORIES: { name: string; group: ExpenseGroup }[] = [
  { name: "Prolabore", group: "fixo" },
  { name: "Ferramentas e plataformas", group: "fixo" },
  { name: "Estagiário", group: "fixo" },
  { name: "Contabilidade", group: "fixo" },
  { name: "INSS", group: "fixo" },
  { name: "Impostos Simples", group: "variavel" },
  { name: "Taxa de antecipação", group: "despesa" },
  { name: "Outras despesas", group: "despesa" },
  { name: "Tráfego pago", group: "investimento" },
  { name: "Equipamentos", group: "investimento" },
  { name: "Conhecimento", group: "investimento" },
  { name: "Marketing", group: "investimento" },
  { name: "Distribuição Lucros", group: "destinacao" },
  { name: "Reserva Financeira", group: "destinacao" },
  { name: "Reserva de oportunidades", group: "destinacao" },
];

export const SEED_PAY_METHODS: NamedMethod[] = [
  { name: "Pix/débito PJ", account: "C6" },
  { name: "Cartão crédito (Nubank PF)", account: "Nubank PF" },
  { name: "Cartão crédito (Natália)", account: "Cartão Natália" },
  { name: "C6", account: "C6" },
];

export const SEED_RECV_METHODS: NamedMethod[] = [
  { name: "InfinitePay", account: "InfinitePay" },
  { name: "Pix C6", account: "C6" },
  { name: "Dinheiro", account: "Dinheiro" },
];

export type SeedRecurringCost = {
  category: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  paymentMethod: string;
};

// Valores projetados da planilha (aba "Planejamento anual"). Editáveis depois.
export const SEED_RECURRING_COSTS: SeedRecurringCost[] = [
  { category: "Prolabore", description: "Prolabore", amount: 8000, dayOfMonth: 10, paymentMethod: "Pix/débito PJ" },
  { category: "Ferramentas e plataformas", description: "Ferramentas e plataformas", amount: 765, dayOfMonth: 10, paymentMethod: "Pix/débito PJ" },
  { category: "Estagiário", description: "Estagiário", amount: 600, dayOfMonth: 8, paymentMethod: "Pix/débito PJ" },
  { category: "Contabilidade", description: "Contabilidade", amount: 398, dayOfMonth: 10, paymentMethod: "Pix/débito PJ" },
  { category: "INSS", description: "INSS", amount: 220, dayOfMonth: 20, paymentMethod: "Pix/débito PJ" },
  { category: "Impostos Simples", description: "DAS Simples", amount: 1700, dayOfMonth: 20, paymentMethod: "Pix/débito PJ" },
];

export function normalizeLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchLabel(options: string[], value: string | null | undefined): string | null {
  if (!value) return null;
  const n = normalizeLabel(value);
  return options.find((o) => normalizeLabel(o) === n) ?? null;
}

type SeedItem = {
  type: ConfigType;
  value: string;
  group: ExpenseGroup | null;
  account: string | null;
  order: number;
};

function seedItems(): SeedItem[] {
  return [
    ...SEED_INCOME_CATEGORIES.map((value, order) => ({ type: "income_cat" as const, value, group: null, account: null, order })),
    ...SEED_EXPENSE_CATEGORIES.map((c, order) => ({ type: "expense_cat" as const, value: c.name, group: c.group, account: null, order })),
    ...SEED_PAY_METHODS.map((m, order) => ({ type: "pay_method" as const, value: m.name, group: null, account: m.account, order })),
    ...SEED_RECV_METHODS.map((m, order) => ({ type: "recv_method" as const, value: m.name, group: null, account: m.account, order })),
  ];
}

export function planSeed(rows: ConfigRow[]): {
  create: SeedItem[];
  update: { id: string; group?: string; account?: string }[];
} {
  const create: SeedItem[] = [];
  const update: { id: string; group?: string; account?: string }[] = [];
  for (const item of seedItems()) {
    const existing = rows.find(
      (r) => r.type === item.type && normalizeLabel(r.value) === normalizeLabel(item.value),
    );
    if (!existing) {
      create.push(item);
      continue;
    }
    const patch: { id: string; group?: string; account?: string } = { id: existing.id };
    if (item.group && !existing.group) patch.group = item.group;
    if (item.account && !existing.account) patch.account = item.account;
    if (patch.group || patch.account) update.push(patch);
  }
  return { create, update };
}

function seedGroup(name: string): ExpenseGroup | null {
  return SEED_EXPENSE_CATEGORIES.find((c) => normalizeLabel(c.name) === normalizeLabel(name))?.group ?? null;
}

function seedAccount(name: string): string | null {
  return (
    [...SEED_PAY_METHODS, ...SEED_RECV_METHODS].find((m) => normalizeLabel(m.name) === normalizeLabel(name))
      ?.account ?? null
  );
}

function asGroup(group: string | null, name: string): ExpenseGroup {
  if (group && (EXPENSE_GROUPS as string[]).includes(group)) return group as ExpenseGroup;
  return seedGroup(name) ?? "despesa";
}

export function buildVocab(rows: ConfigRow[]): Vocab {
  const active = rows.filter((r) => r.active).sort((a, b) => a.order - b.order);
  const of = (t: ConfigType) => active.filter((r) => r.type === t);
  const method = (r: ConfigRow): NamedMethod => ({
    name: r.value,
    account: r.account ?? seedAccount(r.value) ?? r.value,
  });
  return {
    incomeCategories: of("income_cat").map((r) => r.value),
    expenseCategories: of("expense_cat").map((r) => ({ name: r.value, group: asGroup(r.group, r.value) })),
    payMethods: of("pay_method").map(method),
    recvMethods: of("recv_method").map(method),
  };
}

export function accountOfMethod(vocab: Vocab, method: string | null | undefined): string | null {
  if (!method) return null;
  const n = normalizeLabel(method);
  return [...vocab.payMethods, ...vocab.recvMethods].find((m) => normalizeLabel(m.name) === n)?.account ?? null;
}

export function groupOfCategory(vocab: Vocab, category: string): ExpenseGroup | null {
  const n = normalizeLabel(category);
  return vocab.expenseCategories.find((c) => normalizeLabel(c.name) === n)?.group ?? null;
}

export function accountsOf(vocab: Vocab): string[] {
  return [...new Set([...vocab.payMethods, ...vocab.recvMethods].map((m) => m.account))];
}

export function methodsForAccount(vocab: Vocab, account: string): string[] {
  return [...vocab.payMethods, ...vocab.recvMethods].filter((m) => m.account === account).map((m) => m.name);
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/vocab.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 10: Alterar o schema**

Em `prisma/schema.prisma`:

1. No `model User`, logo depois de `financialMonthCloses FinancialMonthClose[]`, adicionar:

```prisma
  financialBudgets     FinancialBudget[]
  recurringCosts       RecurringCost[]
  bankBalanceSnapshots BankBalanceSnapshot[]
```

2. No `model FinancialTx`, depois de `updatedAt DateTime @updatedAt` e antes das relações, adicionar:

```prisma
  source          String?   // manual | telegram | jarvis | foto | extrato | recorrente | planilha | infinitepay
  needsReview     Boolean   @default(false)
  rawInput        String?   // mensagem original ou linha do extrato, para auditoria
  externalId      String?   // FITID ou hash de dedupe do extrato
  recurringCostId String?
```

e, no fim do model (depois de `invoiceIssues InvoiceIssue[]`):

```prisma

  @@index([externalId])
  @@index([recurringCostId])
```

3. No `model FinancialConfig`, depois de `active Boolean @default(true)`:

```prisma
  group     String?  // categorias de saída: fixo | variavel | despesa | investimento | destinacao
  account   String?  // formas de pagamento/recebimento: C6 | Nubank PF | Cartão Natália | InfinitePay | Dinheiro
```

4. No fim do arquivo, adicionar:

```prisma
// Projetado por categoria e mês (aba "Planejamento anual" da planilha)
model FinancialBudget {
  id        String   @id @default(cuid())
  userId    String
  month     String   // YYYY-MM
  category  String
  amount    Float
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, month, category])
}

// Custos fixos que viram "a pagar" no dia 1 de cada mês
model RecurringCost {
  id            String   @id @default(cuid())
  userId        String
  category      String
  description   String
  amount        Float
  dayOfMonth    Int
  paymentMethod String?
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, active])
}

// Saldo informado por um extrato (base do saldo estimado)
model BankBalanceSnapshot {
  id        String   @id @default(cuid())
  userId    String
  account   String
  balance   Float
  asOf      DateTime
  source    String   // extrato | manual
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, account, asOf])
}

// Pendências da captura: confirmação de foto/extrato, pergunta de categoria,
// janela de desfazer (24h) e correção de comprovante.
model CapturePending {
  id        String   @id @default(cuid())
  kind      String   // confirm | question | undo | correction
  chatId    String   // "owner" — sistema de um dono só
  payload   Json
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([chatId, kind])
}
```

- [ ] **Step 11: Aplicar o schema**

Run: `npx prisma format && npx prisma db push && npx prisma generate`
Expected: `db push` lista apenas colunas/tabelas novas (nenhum "data loss" warning). Se aparecer aviso de perda de dados, **pare** e não confirme: algo diferente do previsto mudou.

- [ ] **Step 12: Implementar `setup.ts`**

Criar `src/lib/financeiro/setup.ts`:

```ts
// Garante que o vocabulário oficial e os custos fixos existem no banco.
// Idempotente: pode rodar a cada captura sem duplicar nada.

import { prisma } from "@/lib/prisma";
import { buildVocab, planSeed, SEED_RECURRING_COSTS, type Vocab } from "./vocab";

export async function ensureFinanceSetup(userId: string): Promise<Vocab> {
  const rows = await prisma.financialConfig.findMany({ where: { userId } });
  const plan = planSeed(rows);

  if (plan.create.length > 0) {
    await prisma.financialConfig.createMany({
      data: plan.create.map((c) => ({
        userId,
        type: c.type,
        value: c.value,
        group: c.group,
        account: c.account,
        order: c.order,
      })),
    });
  }
  for (const u of plan.update) {
    await prisma.financialConfig.update({
      where: { id: u.id },
      data: { group: u.group, account: u.account },
    });
  }

  const recurringCount = await prisma.recurringCost.count({ where: { userId } });
  if (recurringCount === 0) {
    await prisma.recurringCost.createMany({
      data: SEED_RECURRING_COSTS.map((c) => ({ ...c, userId })),
    });
  }

  const changed = plan.create.length > 0 || plan.update.length > 0;
  const fresh = changed ? await prisma.financialConfig.findMany({ where: { userId } }) : rows;
  return buildVocab(fresh);
}
```

- [ ] **Step 13: Registrar os ajustes na spec**

Em `docs/superpowers/specs/2026-10-15-financeiro-fgt-captura-e-planilha-design.md`, logo antes de `## Fora de escopo (registrado para depois)`, inserir:

```markdown
## Ajustes feitos no Plano 1 (2026-10-16)

1. `CapturePending` tem `kind` (`confirm | question | undo | correction`) e `chatId` fixo `"owner"`, sem `userId`.
2. O interpretador tem também a ação `recategorize` (responder "é ferramenta" por voz).
3. Os dois crons mensais viraram um slot `monthly` (dia 1, 09h BRT).
4. Linhas de extrato de transferência entre contas próprias, pagamento de fatura ou aplicação/resgate são ignoradas (`IGNORAR`), para não contar em dobro com a fatura do cartão.
5. Modelo: Haiku 5.5 em tudo, um modelo por tarefa (`capture`, `ask`, `categorize`, `document`). A tarefa que falhar na avaliação com frases reais (`npm run eval:finance`) sobe para Sonnet 5.5, só ela.
```

- [ ] **Step 14: Rodar a suíte, checar tipos e commitar**

Run: `npm test && npx tsc --noEmit`
Expected: todos PASS; `tsc` sem erros.

```bash
git add vitest.config.ts prisma/schema.prisma src/lib/financeiro/dates.ts src/lib/financeiro/dates.test.ts src/lib/financeiro/vocab.ts src/lib/financeiro/vocab.test.ts src/lib/financeiro/setup.ts docs/superpowers/specs/2026-10-15-financeiro-fgt-captura-e-planilha-design.md
git commit -m "feat(finance): official vocabulary, capture schema and date utils

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Livro-razão unificado

Junta lançamentos (`FinancialTx`) e o **caixa** das vendas (parcelas, via `buildSaleTxs`) numa lista só, com **uma** data efetiva por item. Isso corrige a contagem dupla entre meses (pendência #2 de 2026-07-28) para tudo que este plano calcula.

**Files:**
- Create: `src/lib/financeiro/ledger.ts`, `src/lib/financeiro/ledger.test.ts`
- Create: `src/lib/financeiro/ledgerLoader.ts`

**Interfaces:**
- Consumes: `buildSaleTxs`, `SaleInput`, `SaleTx` de `./saleTxs`; `isoDate`, `addDays` de `./dates`.
- Produces:
  - `type LedgerEntry = { ref: string; kind: "receita" | "despesa"; amount: number; category: string; description: string; status: "pago" | "pendente" | "cancelado"; date: string; dueDate: string | null; paidAt: string | null; paymentMethod: string | null; clientName: string | null; source: string; needsReview: boolean }` — `ref` é `"tx:<id>"` ou `"inst:<installmentId>"`; `source` é `"venda"` para parcelas.
  - `type TxRow` (formato que o Prisma devolve com `include: { client: { select: { name: true } } }`).
  - `txToEntry(t: TxRow): LedgerEntry`, `saleCaixaToEntry(s: SaleTx): LedgerEntry | null`, `buildLedger(txs: TxRow[], saleTxs: SaleTx[]): LedgerEntry[]`, `entriesInMonth(entries, month)`, `entriesBetween(entries, from, to)`, `selectOpenItems(entries, today): LedgerEntry[]`, `splitRef(ref): ["tx" | "inst", string]`.
  - `ledgerLoader.ts`: `loadLedger(userId: string): Promise<LedgerEntry[]>`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/financeiro/ledger.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildLedger, txToEntry, entriesInMonth, entriesBetween, selectOpenItems, splitRef, type TxRow,
} from "./ledger";
import type { SaleTx } from "./saleTxs";

function tx(p: Partial<TxRow> & Pick<TxRow, "id">): TxRow {
  return {
    type: "despesa", description: "x", amount: 10, category: "Outras despesas", status: "pago",
    dueDate: null, paidAt: null, createdAt: new Date("2026-07-01T12:00:00Z"), paymentMethod: null,
    source: null, needsReview: false, installmentId: null, client: null, ...p,
  };
}

function saleLine(p: Partial<SaleTx> & Pick<SaleTx, "id" | "_flow">): SaleTx {
  return {
    type: "receita", description: "Consultoria anual", amount: 1800, category: "Caixa", status: "pago",
    dueDate: "2026-08-05T12:00:00.000Z", paidAt: "2026-08-04T12:00:00.000Z", paymentMethod: "Pix",
    notes: null, client: { id: "c1", name: "Aleska" }, _saleId: "s1", _installmentId: "i1", ...p,
  };
}

describe("ledger", () => {
  it("lançamento pago conta no mês do pagamento, não do vencimento (defeito #2)", () => {
    const e = txToEntry(tx({
      id: "a", dueDate: new Date("2026-07-15T12:00:00Z"), paidAt: new Date("2026-08-01T12:00:00Z"),
    }));
    expect(e.date).toBe("2026-08-01");
    expect(entriesInMonth([e], "2026-07")).toHaveLength(0);
    expect(entriesInMonth([e], "2026-08")).toHaveLength(1);
  });

  it("pendente usa o vencimento e 'atrasado' vira pendente", () => {
    const e = txToEntry(tx({ id: "b", status: "atrasado", dueDate: new Date("2026-10-31T12:00:00Z") }));
    expect(e.status).toBe("pendente");
    expect(e.date).toBe("2026-10-31");
    expect(e.ref).toBe("tx:b");
    expect(e.source).toBe("manual");
  });

  it("de venda entra só a linha de caixa, com ref da parcela", () => {
    const ledger = buildLedger([], [
      saleLine({ id: "fat_i1", _flow: "faturamento", category: "Faturamento" }),
      saleLine({ id: "inst_i1", _flow: "caixa" }),
    ]);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ ref: "inst:i1", kind: "receita", source: "venda", date: "2026-08-05", clientName: "Aleska" });
  });

  it("cancelados ficam de fora e a lista sai ordenada por data", () => {
    const ledger = buildLedger([
      tx({ id: "z", paidAt: new Date("2026-09-10T12:00:00Z") }),
      tx({ id: "y", paidAt: new Date("2026-09-01T12:00:00Z") }),
      tx({ id: "x", status: "cancelado", paidAt: new Date("2026-09-05T12:00:00Z") }),
    ], []);
    expect(ledger.map((e) => e.ref)).toEqual(["tx:y", "tx:z"]);
    expect(entriesBetween(ledger, "2026-09-02", "2026-09-30").map((e) => e.ref)).toEqual(["tx:z"]);
  });

  it("itens em aberto: só pendentes numa janela útil em volta de hoje", () => {
    const ledger = buildLedger([
      tx({ id: "velho", status: "pendente", dueDate: new Date("2026-05-01T12:00:00Z") }),
      tx({ id: "perto", status: "pendente", dueDate: new Date("2026-10-31T12:00:00Z") }),
      tx({ id: "pago", status: "pago", paidAt: new Date("2026-10-10T12:00:00Z") }),
    ], []);
    expect(selectOpenItems(ledger, "2026-10-16").map((e) => e.ref)).toEqual(["tx:perto"]);
  });

  it("splitRef separa o tipo do id", () => {
    expect(splitRef("tx:abc")).toEqual(["tx", "abc"]);
    expect(splitRef("inst:def")).toEqual(["inst", "def"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/ledger.test.ts`
Expected: FAIL com "Failed to resolve import ./ledger".

- [ ] **Step 3: Implementar `ledger.ts`**

Criar `src/lib/financeiro/ledger.ts`:

```ts
// Livro-razão unificado: lançamentos reais + caixa das vendas, cada item com
// UMA data efetiva. Realizado conta no mês do pagamento; pendente, no vencimento.
// Faturamento de venda fica de fora: aqui só interessa dinheiro (caixa).

import type { SaleTx } from "./saleTxs";
import { addDays, isoDate } from "./dates";

export type EntryKind = "receita" | "despesa";
export type EntryStatus = "pago" | "pendente" | "cancelado";

export type LedgerEntry = {
  ref: string;
  kind: EntryKind;
  amount: number;
  category: string;
  description: string;
  status: EntryStatus;
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  clientName: string | null;
  source: string;
  needsReview: boolean;
};

export type TxRow = {
  id: string;
  type: string;
  description: string;
  amount: number;
  category: string;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  paymentMethod: string | null;
  source: string | null;
  needsReview: boolean;
  installmentId: string | null;
  client: { name: string } | null;
};

export function normalizeStatus(s: string): EntryStatus {
  if (s === "pago") return "pago";
  if (s === "cancelado") return "cancelado";
  return "pendente";
}

export function txToEntry(t: TxRow): LedgerEntry {
  const status = normalizeStatus(t.status);
  const due = t.dueDate ? isoDate(t.dueDate) : null;
  const paid = t.paidAt ? isoDate(t.paidAt) : null;
  const created = isoDate(t.createdAt);
  const date = status === "pago" ? (paid ?? due ?? created) : (due ?? created);
  return {
    ref: `tx:${t.id}`,
    kind: t.type === "receita" ? "receita" : "despesa",
    amount: t.amount,
    category: t.category,
    description: t.description,
    status,
    date,
    dueDate: due,
    paidAt: paid,
    paymentMethod: t.paymentMethod,
    clientName: t.client?.name ?? null,
    source: t.source ?? "manual",
    needsReview: t.needsReview,
  };
}

export function saleCaixaToEntry(s: SaleTx): LedgerEntry | null {
  if (s._flow !== "caixa" || !s._installmentId) return null;
  const date = (s.dueDate ?? s.paidAt)?.slice(0, 10);
  if (!date) return null;
  return {
    ref: `inst:${s._installmentId}`,
    kind: "receita",
    amount: s.amount,
    category: "Venda",
    description: s.description,
    status: normalizeStatus(s.status),
    date,
    dueDate: s.dueDate?.slice(0, 10) ?? null,
    paidAt: s.paidAt?.slice(0, 10) ?? null,
    paymentMethod: s.paymentMethod,
    clientName: s.client.name,
    source: "venda",
    needsReview: false,
  };
}

export function buildLedger(txs: TxRow[], saleTxs: SaleTx[]): LedgerEntry[] {
  const fromSales = saleTxs.map(saleCaixaToEntry).filter((e): e is LedgerEntry => e !== null);
  return [...txs.map(txToEntry), ...fromSales]
    .filter((e) => e.status !== "cancelado")
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function entriesInMonth(entries: LedgerEntry[], month: string): LedgerEntry[] {
  return entries.filter((e) => e.date.slice(0, 7) === month);
}

export function entriesBetween(entries: LedgerEntry[], from: string, to: string): LedgerEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to);
}

// Contas em aberto relevantes para interpretar "boleto contadora foi pago":
// vencidas há até 60 dias ou vencendo nos próximos 45.
export function selectOpenItems(entries: LedgerEntry[], today: string): LedgerEntry[] {
  const from = addDays(today, -60);
  const to = addDays(today, 45);
  return entries
    .filter((e) => e.status === "pendente")
    .filter((e) => {
      const d = e.dueDate ?? e.date;
      return d >= from && d <= to;
    })
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date))
    .slice(0, 80);
}

export function splitRef(ref: string): ["tx" | "inst", string] {
  const i = ref.indexOf(":");
  const type = ref.slice(0, i) === "inst" ? "inst" : "tx";
  return [type, ref.slice(i + 1)];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/ledger.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Implementar `ledgerLoader.ts`**

Criar `src/lib/financeiro/ledgerLoader.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { buildSaleTxs, type SaleInput } from "./saleTxs";
import { buildLedger, type LedgerEntry } from "./ledger";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadLedger(userId: string): Promise<LedgerEntry[]> {
  const [txs, sales] = await Promise.all([
    prisma.financialTx.findMany({ include: { client: { select: { name: true } } } }),
    prisma.sale.findMany({
      where: { client: { userId } },
      include: {
        client: { select: { id: true, name: true } },
        installments: { orderBy: { number: "asc" } },
      },
    }),
  ]);

  const saleInputs: SaleInput[] = sales.map((s) => ({
    id: s.id,
    description: s.description,
    negotiationType: s.negotiationType,
    grossValue: s.grossValue,
    paymentMethod: s.paymentMethod,
    installmentsCount: s.installmentsCount,
    createdAt: iso(s.createdAt),
    client: s.client,
    installments: s.installments.map((i) => ({
      id: i.id,
      number: i.number,
      amount: i.amount,
      netValue: i.netValue,
      dueDate: iso(i.dueDate),
      cashDate: iso(i.cashDate),
      paidAt: iso(i.paidAt),
      status: i.status,
      label: i.label,
      paymentMethod: i.paymentMethod,
    })),
  }));

  // Parcela que já tem FinancialTx próprio não gera linha derivada (regra do buildSaleTxs).
  const linked = new Set(txs.map((t) => t.installmentId).filter((x): x is string => !!x));
  return buildLedger(txs, buildSaleTxs(saleInputs, linked));
}
```

- [ ] **Step 6: Checar tipos e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS.

```bash
git add src/lib/financeiro/ledger.ts src/lib/financeiro/ledger.test.ts src/lib/financeiro/ledgerLoader.ts
git commit -m "feat(finance): unified cash ledger with single effective date per entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Deduplicação de extrato

**Files:**
- Create: `src/lib/financeiro/dedupe.ts`, `src/lib/financeiro/dedupe.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry` (Task 2), `daysBetween` (Task 1).
- Produces:
  - `type StatementRow = { date: string; amount: number; description: string; externalId: string }` — `amount` com sinal: positivo entra, negativo sai.
  - `type DedupeVerdict = { verdict: "new" } | { verdict: "duplicate"; reason: "externalId" | "venda" | "manual"; ref: string | null } | { verdict: "settles"; ref: string }`.
  - `dedupeRows(rows: StatementRow[], ledger: LedgerEntry[], knownExternalIds: Set<string>): { row: StatementRow; result: DedupeVerdict }[]`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/financeiro/dedupe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupeRows, type StatementRow } from "./dedupe";
import type { LedgerEntry } from "./ledger";

function entry(p: Partial<LedgerEntry> & Pick<LedgerEntry, "ref">): LedgerEntry {
  return {
    kind: "despesa", amount: 100, category: "Outras despesas", description: "x", status: "pago",
    date: "2026-09-10", dueDate: null, paidAt: "2026-09-10", paymentMethod: null, clientName: null,
    source: "manual", needsReview: false, ...p,
  };
}
const row = (p: Partial<StatementRow>): StatementRow => ({
  date: "2026-09-10", amount: -100, description: "PIX", externalId: "C6|x#1", ...p,
});

describe("dedupeRows", () => {
  it("pula linha já importada (mesmo externalId)", () => {
    const [r] = dedupeRows([row({ externalId: "C6|fit|123" })], [], new Set(["C6|fit|123"]));
    expect(r.result).toEqual({ verdict: "duplicate", reason: "externalId", ref: null });
  });

  it("pula recebimento que já veio da InfinitePay (valor líquido, até 3 dias)", () => {
    const ledger = [entry({ ref: "inst:i1", kind: "receita", source: "venda", amount: 1748.7, date: "2026-09-02" })];
    const [r] = dedupeRows([row({ amount: 1748.7, date: "2026-09-04" })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "duplicate", reason: "venda", ref: "inst:i1" });
  });

  it("propõe baixa de conta a pagar em aberto (valor ±1%, até 5 dias do vencimento)", () => {
    const ledger = [entry({ ref: "tx:cont", status: "pendente", amount: 398, dueDate: "2026-09-10", date: "2026-09-10", paidAt: null })];
    const [r] = dedupeRows([row({ amount: -401, date: "2026-09-12" })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "settles", ref: "tx:cont" });
  });

  it("pula saída já lançada à mão com mesmo valor e data próxima", () => {
    const ledger = [entry({ ref: "tx:mfit", amount: 39.9, date: "2026-09-09" })];
    const [r] = dedupeRows([row({ amount: -39.9, date: "2026-09-10" })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "duplicate", reason: "manual", ref: "tx:mfit" });
  });

  it("um lançamento só absorve uma linha: a segunda compra igual é nova", () => {
    const ledger = [entry({ ref: "tx:cafe", amount: 27.1 })];
    const res = dedupeRows(
      [row({ amount: -27.1, externalId: "a#1" }), row({ amount: -27.1, externalId: "a#2" })],
      ledger, new Set(),
    );
    expect(res.map((r) => r.result.verdict)).toEqual(["duplicate", "new"]);
  });

  it("não confunde entrada com saída de mesmo valor", () => {
    const ledger = [entry({ ref: "tx:out", amount: 200 })];
    const [r] = dedupeRows([row({ amount: 200 })], ledger, new Set());
    expect(r.result).toEqual({ verdict: "new" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/dedupe.test.ts`
Expected: FAIL com "Failed to resolve import ./dedupe".

- [ ] **Step 3: Implementar `dedupe.ts`**

Criar `src/lib/financeiro/dedupe.ts`:

```ts
// Decide o destino de cada linha de extrato: nova, duplicada ou baixa de uma
// conta em aberto. Cada lançamento do livro-razão absorve no máximo uma linha.

import { daysBetween } from "./dates";
import type { LedgerEntry } from "./ledger";

export type StatementRow = {
  date: string;
  amount: number; // positivo entra, negativo sai
  description: string;
  externalId: string;
};

export type DedupeVerdict =
  | { verdict: "new" }
  | { verdict: "duplicate"; reason: "externalId" | "venda" | "manual"; ref: string | null }
  | { verdict: "settles"; ref: string };

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;

function dedupeRow(
  row: StatementRow,
  ledger: LedgerEntry[],
  knownExternalIds: Set<string>,
  used: Set<string>,
): DedupeVerdict {
  if (knownExternalIds.has(row.externalId)) {
    return { verdict: "duplicate", reason: "externalId", ref: null };
  }
  const kind = row.amount >= 0 ? "receita" : "despesa";
  const abs = Math.abs(row.amount);
  const free = (e: LedgerEntry) => e.kind === kind && !used.has(e.ref);
  const take = (e: LedgerEntry) => {
    used.add(e.ref);
    return e.ref;
  };

  const venda = ledger.find(
    (e) => free(e) && e.source === "venda" && e.status === "pago"
      && near(e.amount, abs, 0.05) && daysBetween(e.date, row.date) <= 3,
  );
  if (venda) return { verdict: "duplicate", reason: "venda", ref: take(venda) };

  const manual = ledger.find(
    (e) => free(e) && e.source !== "venda" && e.status === "pago"
      && near(e.amount, abs, 0.01) && daysBetween(e.date, row.date) <= 2,
  );
  if (manual) return { verdict: "duplicate", reason: "manual", ref: take(manual) };

  const open = ledger.find(
    (e) => free(e) && e.status === "pendente"
      && near(e.amount, abs, Math.max(abs * 0.01, 0.01))
      && daysBetween(e.dueDate ?? e.date, row.date) <= 5,
  );
  if (open) return { verdict: "settles", ref: take(open) };

  return { verdict: "new" };
}

export function dedupeRows(
  rows: StatementRow[],
  ledger: LedgerEntry[],
  knownExternalIds: Set<string>,
): { row: StatementRow; result: DedupeVerdict }[] {
  const used = new Set<string>();
  return rows.map((row) => ({ row, result: dedupeRow(row, ledger, knownExternalIds, used) }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/dedupe.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commitar**

```bash
git add src/lib/financeiro/dedupe.ts src/lib/financeiro/dedupe.test.ts
git commit -m "feat(finance): statement row dedupe against ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Custos fixos do mês

**Files:**
- Create: `src/lib/financeiro/recurring.ts`, `src/lib/financeiro/recurring.test.ts`
- Create: `src/lib/financeiro/recurringRunner.ts`

**Interfaces:**
- Consumes: `ensureFinanceSetup` (Task 1), `toDbDate`, `fmtBRL`, `monthLabel`, `addDays` (Task 1).
- Produces:
  - `type RecurringCostRow = { id: string; category: string; description: string; amount: number; dayOfMonth: number; paymentMethod: string | null; active: boolean }`.
  - `type RecurringTxDraft = { recurringCostId: string; description: string; amount: number; category: string; dueDate: string; paymentMethod: string | null }`.
  - `dueDateFor(month: string, day: number): string`, `planRecurringForMonth(costs, month, alreadyGenerated: Set<string>): RecurringTxDraft[]`, `previousMonth(month: string): string`, `buildMonthlyMessage(p: { month: string; created: RecurringTxDraft[]; reviewCount: number }): string`.
  - `recurringRunner.ts`: `generateRecurringForMonth(userId: string, month: string): Promise<RecurringTxDraft[]>`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/financeiro/recurring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  dueDateFor, planRecurringForMonth, previousMonth, buildMonthlyMessage, type RecurringCostRow,
} from "./recurring";

const cost = (p: Partial<RecurringCostRow> & Pick<RecurringCostRow, "id">): RecurringCostRow => ({
  category: "Contabilidade", description: "Contabilidade", amount: 398, dayOfMonth: 10,
  paymentMethod: "Pix/débito PJ", active: true, ...p,
});

describe("recurring", () => {
  it("vencimento respeita o último dia do mês", () => {
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateFor("2026-10", 10)).toBe("2026-10-10");
    expect(dueDateFor("2026-10", 0)).toBe("2026-10-01");
  });

  it("gera só os ativos que ainda não foram gerados no mês", () => {
    const drafts = planRecurringForMonth(
      [cost({ id: "a" }), cost({ id: "b", active: false }), cost({ id: "c", amount: 600, category: "Estagiário", description: "Estagiário", dayOfMonth: 8 })],
      "2026-10",
      new Set(["a"]),
    );
    expect(drafts).toEqual([
      { recurringCostId: "c", description: "Estagiário", amount: 600, category: "Estagiário", dueDate: "2026-10-08", paymentMethod: "Pix/débito PJ" },
    ]);
  });

  it("mês anterior atravessa o ano", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });

  it("mensagem da virada lista os fixos, pede o extrato do mês anterior e cita revisões", () => {
    const msg = buildMonthlyMessage({
      month: "2026-11",
      created: [{ recurringCostId: "c", description: "Contabilidade", amount: 398, category: "Contabilidade", dueDate: "2026-11-10", paymentMethod: null }],
      reviewCount: 3,
    });
    expect(msg).toContain("novembro/2026");
    expect(msg).toContain("Contabilidade");
    expect(msg).toContain("dia 10");
    expect(msg).toContain("outubro/2026");
    expect(msg).toContain("3 lançamentos");
  });

  it("sem fixos novos e sem revisão, a mensagem só pede o extrato", () => {
    const msg = buildMonthlyMessage({ month: "2026-11", created: [], reviewCount: 0 });
    expect(msg).not.toContain("Lancei");
    expect(msg).not.toContain("revisão");
    expect(msg).toContain("extrato");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/recurring.test.ts`
Expected: FAIL com "Failed to resolve import ./recurring".

- [ ] **Step 3: Implementar `recurring.ts`**

Criar `src/lib/financeiro/recurring.ts`:

```ts
// Custos fixos recorrentes: no dia 1 viram "a pagar" do mês.

import { fmtBRL, monthLabel } from "./dates";

export type RecurringCostRow = {
  id: string;
  category: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  paymentMethod: string | null;
  active: boolean;
};

export type RecurringTxDraft = {
  recurringCostId: string;
  description: string;
  amount: number;
  category: string;
  dueDate: string;
  paymentMethod: string | null;
};

export function dueDateFor(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(day, 1), last);
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function planRecurringForMonth(
  costs: RecurringCostRow[],
  month: string,
  alreadyGenerated: Set<string>,
): RecurringTxDraft[] {
  return costs
    .filter((c) => c.active && !alreadyGenerated.has(c.id))
    .map((c) => ({
      recurringCostId: c.id,
      description: c.description,
      amount: c.amount,
      category: c.category,
      dueDate: dueDateFor(month, c.dayOfMonth),
      paymentMethod: c.paymentMethod,
    }));
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function buildMonthlyMessage(p: { month: string; created: RecurringTxDraft[]; reviewCount: number }): string {
  const lines = ["🗓️ *Virada do mês*", ""];
  if (p.created.length > 0) {
    lines.push(`📌 Lancei os fixos de ${monthLabel(p.month)} como a pagar:`);
    for (const d of p.created) {
      lines.push(`• ${d.description} ${fmtBRL(d.amount)} (dia ${Number(d.dueDate.slice(8, 10))})`);
    }
    lines.push("");
  }
  lines.push(
    `📎 Fechamento de ${monthLabel(previousMonth(p.month))}: me manda aqui o extrato do C6 e a fatura do Nubank (OFX ou CSV).`,
  );
  if (p.reviewCount > 0) {
    lines.push(`🟡 ${p.reviewCount} lançamentos esperando revisão no painel.`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/recurring.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Implementar `recurringRunner.ts`**

Criar `src/lib/financeiro/recurringRunner.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { ensureFinanceSetup } from "./setup";
import { toDbDate } from "./dates";
import { planRecurringForMonth, type RecurringTxDraft } from "./recurring";

// Idempotente por (recurringCostId, mês): rodar duas vezes não duplica.
export async function generateRecurringForMonth(userId: string, month: string): Promise<RecurringTxDraft[]> {
  await ensureFinanceSetup(userId);
  const costs = await prisma.recurringCost.findMany({ where: { userId } });

  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const existing = await prisma.financialTx.findMany({
    where: { recurringCostId: { not: null }, dueDate: { gte: start, lt: end } },
    select: { recurringCostId: true },
  });

  const drafts = planRecurringForMonth(
    costs,
    month,
    new Set(existing.map((e) => e.recurringCostId).filter((x): x is string => !!x)),
  );
  if (drafts.length === 0) return [];

  await prisma.financialTx.createMany({
    data: drafts.map((d) => ({
      type: "despesa",
      description: d.description,
      amount: d.amount,
      category: d.category,
      status: "pendente",
      dueDate: toDbDate(d.dueDate),
      paymentMethod: d.paymentMethod,
      source: "recorrente",
      recurringCostId: d.recurringCostId,
    })),
  });
  return drafts;
}
```

- [ ] **Step 6: Checar tipos e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS.

```bash
git add src/lib/financeiro/recurring.ts src/lib/financeiro/recurring.test.ts src/lib/financeiro/recurringRunner.ts
git commit -m "feat(finance): monthly recurring fixed costs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Saldo estimado

**Files:**
- Create: `src/lib/financeiro/balance.ts`, `src/lib/financeiro/balance.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry` (Task 2), `round2` (Task 1).
- Produces:
  - `type BalanceSnapshot = { account: string; balance: number; asOf: string }`.
  - `type BalanceEstimate = { account: string; balance: number; baseDate: string; movementsAfter: number } | { account: string; balance: null; reason: "sem_extrato" }`.
  - `latestSnapshot(snapshots: BalanceSnapshot[], account: string): BalanceSnapshot | null`.
  - `estimateBalance(account: string, snapshot: BalanceSnapshot | null, ledger: LedgerEntry[], accountOf: (method: string | null) => string | null): BalanceEstimate`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/financeiro/balance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estimateBalance, latestSnapshot } from "./balance";
import type { LedgerEntry } from "./ledger";

const e = (p: Partial<LedgerEntry>): LedgerEntry => ({
  ref: "tx:1", kind: "despesa", amount: 0, category: "x", description: "x", status: "pago",
  date: "2026-10-05", dueDate: null, paidAt: null, paymentMethod: "Pix/débito PJ", clientName: null,
  source: "manual", needsReview: false, ...p,
});
const accountOf = (m: string | null) => (m === "Pix/débito PJ" || m === "Pix C6" ? "C6" : m === "Cartão crédito (Natália)" ? "Cartão Natália" : null);

describe("balance", () => {
  it("saldo do extrato + movimentos realizados depois, só da conta pedida", () => {
    const ledger = [
      e({ ref: "tx:antes", amount: 999, date: "2026-09-30" }),
      e({ ref: "tx:saida", amount: 100, date: "2026-10-05" }),
      e({ ref: "tx:entrada", kind: "receita", amount: 1800, date: "2026-10-06", paymentMethod: "Pix C6" }),
      e({ ref: "tx:pendente", amount: 500, status: "pendente", date: "2026-10-07" }),
      e({ ref: "tx:outra", amount: 50, date: "2026-10-08", paymentMethod: "Cartão crédito (Natália)" }),
    ];
    const r = estimateBalance("C6", { account: "C6", balance: 4000, asOf: "2026-10-01" }, ledger, accountOf);
    expect(r).toEqual({ account: "C6", balance: 5700, baseDate: "2026-10-01", movementsAfter: 2 });
  });

  it("sem extrato não chuta saldo", () => {
    expect(estimateBalance("C6", null, [], accountOf)).toEqual({ account: "C6", balance: null, reason: "sem_extrato" });
  });

  it("pega o snapshot mais recente da conta", () => {
    const s = latestSnapshot([
      { account: "C6", balance: 1, asOf: "2026-09-01" },
      { account: "C6", balance: 2, asOf: "2026-10-01" },
      { account: "Nubank PF", balance: 3, asOf: "2026-10-05" },
    ], "C6");
    expect(s?.balance).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/balance.test.ts`
Expected: FAIL com "Failed to resolve import ./balance".

- [ ] **Step 3: Implementar `balance.ts`**

Criar `src/lib/financeiro/balance.ts`:

```ts
// Saldo estimado por conta = último saldo de extrato + movimentos realizados
// depois dele naquela conta. Nunca é "ao vivo"; a resposta sempre diz a base.

import { round2 } from "./dates";
import type { LedgerEntry } from "./ledger";

export type BalanceSnapshot = { account: string; balance: number; asOf: string };

export type BalanceEstimate =
  | { account: string; balance: number; baseDate: string; movementsAfter: number }
  | { account: string; balance: null; reason: "sem_extrato" };

export function latestSnapshot(snapshots: BalanceSnapshot[], account: string): BalanceSnapshot | null {
  return (
    snapshots
      .filter((s) => s.account === account)
      .sort((a, b) => b.asOf.localeCompare(a.asOf))[0] ?? null
  );
}

export function estimateBalance(
  account: string,
  snapshot: BalanceSnapshot | null,
  ledger: LedgerEntry[],
  accountOf: (method: string | null) => string | null,
): BalanceEstimate {
  if (!snapshot) return { account, balance: null, reason: "sem_extrato" };
  const after = ledger.filter(
    (e) => e.status === "pago" && e.date > snapshot.asOf && accountOf(e.paymentMethod) === account,
  );
  const delta = after.reduce((s, e) => s + (e.kind === "receita" ? e.amount : -e.amount), 0);
  return {
    account,
    balance: round2(snapshot.balance + delta),
    baseDate: snapshot.asOf,
    movementsAfter: after.length,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/balance.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commitar**

```bash
git add src/lib/financeiro/balance.ts src/lib/financeiro/balance.test.ts
git commit -m "feat(finance): estimated bank balance from last statement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Leitura de extrato OFX e CSV

**Files:**
- Create: `src/lib/financeiro/statement.ts`, `src/lib/financeiro/statement.test.ts`

**Interfaces:**
- Consumes: `StatementRow` (Task 3), `normalizeLabel` (Task 1).
- Produces:
  - `type RawStatementRow = { date: string; amount: number; description: string; fitId?: string }`.
  - `type ParsedStatement = { rows: RawStatementRow[]; ledgerBalance: { amount: number; date: string } | null; isCard: boolean; invertSign: boolean }`.
  - `parseStatementDate(raw: string): string | null`, `parseStatementAmount(raw: string): number | null`, `parseOfx(text: string): ParsedStatement`, `parseCsv(text: string): ParsedStatement`, `detectAccount(fileName: string, text: string): string | null`, `toStatementRows(parsed: ParsedStatement, account: string): StatementRow[]`, `decodeStatementText(base64: string): string`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/financeiro/statement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseStatementDate, parseStatementAmount, parseOfx, parseCsv, detectAccount, toStatementRows,
  decodeStatementText,
} from "./statement";

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910120000[-3:BRT]<TRNAMT>-39.90<FITID>A1<MEMO>PIX ENVIADO MFIT LTDA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260911<TRNAMT>1800.00<FITID>A2<MEMO>PIX RECEBIDO ALESKA DA ROSA</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4230.15<DTASOF>20260930</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("parse de campos", () => {
  it("datas em vários formatos", () => {
    expect(parseStatementDate("2026-09-03")).toBe("2026-09-03");
    expect(parseStatementDate("03/09/2026")).toBe("2026-09-03");
    expect(parseStatementDate("20260903120000[-3:BRT]")).toBe("2026-09-03");
    expect(parseStatementDate("ontem")).toBeNull();
  });
  it("valores BR, americanos e negativos", () => {
    expect(parseStatementAmount("1.234,56")).toBe(1234.56);
    expect(parseStatementAmount("-39,90")).toBe(-39.9);
    expect(parseStatementAmount("R$ -1.800,00")).toBe(-1800);
    expect(parseStatementAmount("39.90")).toBe(39.9);
    expect(parseStatementAmount("1.800")).toBe(1800);
    expect(parseStatementAmount("−50,00")).toBe(-50);
    expect(parseStatementAmount("")).toBeNull();
  });
});

describe("parseOfx", () => {
  it("lê transações e saldo final", () => {
    const p = parseOfx(OFX);
    expect(p.rows).toEqual([
      { date: "2026-09-10", amount: -39.9, description: "PIX ENVIADO MFIT LTDA", fitId: "A1" },
      { date: "2026-09-11", amount: 1800, description: "PIX RECEBIDO ALESKA DA ROSA", fitId: "A2" },
    ]);
    expect(p.ledgerBalance).toEqual({ amount: 4230.15, date: "2026-09-30" });
    expect(p.isCard).toBe(false);
  });
});

describe("parseCsv", () => {
  it("Nubank conta (Data,Valor,Identificador,Descrição)", () => {
    const p = parseCsv("Data,Valor,Identificador,Descrição\n10/09/2026,-57.00,abc,Compra no débito - OpenAI\n");
    expect(p.rows).toEqual([{ date: "2026-09-10", amount: -57, description: "Compra no débito - OpenAI" }]);
    expect(p.invertSign).toBe(false);
  });
  it("Nubank fatura (date,title,amount): compra positiva vira saída", () => {
    const p = parseCsv("date,title,amount\n2026-09-15,Meta Ads,1094.67\n");
    expect(p.isCard).toBe(true);
    expect(p.invertSign).toBe(true);
    expect(toStatementRows(p, "Nubank PF")[0].amount).toBe(-1094.67);
  });
  it("CSV com ponto e vírgula, aspas e valor BR", () => {
    const p = parseCsv('﻿Data;Descrição;Valor\n"03/09/2026";"PIX ENVIADO; CONTADORA";"-407,29"\n');
    expect(p.rows).toEqual([{ date: "2026-09-03", amount: -407.29, description: "PIX ENVIADO; CONTADORA" }]);
  });
  it("colunas separadas de entrada e saída", () => {
    const p = parseCsv("Data;Histórico;Entrada;Saída\n01/09/2026;Pix;;100,00\n02/09/2026;Pix;250,00;\n");
    expect(p.rows.map((r) => r.amount)).toEqual([-100, 250]);
  });
});

describe("conta e ids", () => {
  it("detecta o banco pelo nome do arquivo ou conteúdo", () => {
    expect(detectAccount("extrato-c6-setembro.ofx", "")).toBe("C6");
    expect(detectAccount("Nubank_2026-09.csv", "")).toBe("Nubank PF");
    expect(detectAccount("extrato.ofx", "<ORG>Banco C6 S.A.")).toBe("C6");
    expect(detectAccount("extrato.csv", "Data,Valor")).toBeNull();
  });
  it("externalId usa o FITID e numera linhas idênticas sem FITID", () => {
    expect(toStatementRows(parseOfx(OFX), "C6")[0].externalId).toBe("C6|fit|A1");
    const p = parseCsv("Data;Descrição;Valor\n03/09/2026;Café;-27,10\n03/09/2026;Café;-27,10\n");
    const ids = toStatementRows(p, "C6").map((r) => r.externalId);
    expect(ids).toEqual(["C6|2026-09-03|-27.10|cafe#1", "C6|2026-09-03|-27.10|cafe#2"]);
  });
  it("decodifica latin1 quando o arquivo não é utf-8", () => {
    const b64 = Buffer.from("Descrição", "latin1").toString("base64");
    expect(decodeStatementText(b64)).toBe("Descrição");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/statement.test.ts`
Expected: FAIL com "Failed to resolve import ./statement".

- [ ] **Step 3: Implementar `statement.ts`**

Criar `src/lib/financeiro/statement.ts`:

```ts
// Leitura determinística de extratos OFX e CSV (C6, Nubank e genéricos).
// PDF não passa por aqui: vai para o modelo em capture/interpret.ts.

import type { StatementRow } from "./dedupe";
import { normalizeLabel } from "./vocab";

export type RawStatementRow = { date: string; amount: number; description: string; fitId?: string };

export type ParsedStatement = {
  rows: RawStatementRow[];
  ledgerBalance: { amount: number; date: string } | null;
  isCard: boolean;
  invertSign: boolean; // fatura que lista compras como positivas
};

export function parseStatementDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function parseStatementAmount(raw: string): number | null {
  let s = raw.replace(/−/g, "-").replace(/R\$|\s/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
  else n = Number(s);
  if (!s || !Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function ofxTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

export function parseOfx(text: string): ParsedStatement {
  const rows: RawStatementRow[] = [];
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const date = parseStatementDate(ofxTag(block, "DTPOSTED"));
    const amount = parseStatementAmount(ofxTag(block, "TRNAMT"));
    const description = ofxTag(block, "MEMO") || ofxTag(block, "NAME");
    const fitId = ofxTag(block, "FITID");
    if (!date || amount === null) continue;
    rows.push({ date, amount, description, ...(fitId ? { fitId } : {}) });
  }
  const lb = text.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|$)/i);
  let ledgerBalance: ParsedStatement["ledgerBalance"] = null;
  if (lb) {
    const amount = parseStatementAmount(ofxTag(lb[1], "BALAMT"));
    const date = parseStatementDate(ofxTag(lb[1], "DTASOF"));
    if (amount !== null && date) ledgerBalance = { amount, date };
  }
  return { rows, ledgerBalance, isCard: /<CCSTMTRS>/i.test(text), invertSign: false };
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delim && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const headerIdx = lines.findIndex((l) => /(^|[;,"])\s*"?(data|date)\b/i.test(l));
  const empty: ParsedStatement = { rows: [], ledgerBalance: null, isCard: false, invertSign: false };
  if (headerIdx < 0) return empty;

  const headerLine = lines[headerIdx];
  const delim = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(headerLine, delim).map((h) => normalizeLabel(h));
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));

  const dateCol = find(/^(data|date)/);
  const amountCol = find(/^(valor|amount|value)/);
  const inCol = find(/^(entrada|credito)/);
  const outCol = find(/^(saida|debito)/);
  let descCol = find(/descri/);
  if (descCol < 0) descCol = find(/^title$/);
  if (descCol < 0) descCol = find(/(hist|lancamento|estabelecimento)/);
  if (dateCol < 0 || descCol < 0 || (amountCol < 0 && (inCol < 0 || outCol < 0))) return empty;

  const isCard = header.includes("title");
  const rows: RawStatementRow[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line, delim);
    const date = parseStatementDate(cells[dateCol] ?? "");
    let amount: number | null;
    if (amountCol >= 0) {
      amount = parseStatementAmount(cells[amountCol] ?? "");
    } else {
      const inV = parseStatementAmount(cells[inCol] ?? "") ?? 0;
      const outV = parseStatementAmount(cells[outCol] ?? "") ?? 0;
      amount = inV - Math.abs(outV);
    }
    if (!date || amount === null || amount === 0) continue;
    rows.push({ date, amount, description: cells[descCol] ?? "" });
  }
  return { rows, ledgerBalance: null, isCard, invertSign: isCard };
}

export function detectAccount(fileName: string, text: string): string | null {
  const hay = `${fileName}\n${text.slice(0, 4000)}`;
  if (/nubank|nu pagamentos|nu financeira/i.test(hay)) return "Nubank PF";
  if (/(^|[^a-z0-9])c6([^a-z0-9]|$)|banco c6|c6 bank/i.test(hay)) return "C6";
  return null;
}

export function toStatementRows(parsed: ParsedStatement, account: string): StatementRow[] {
  const seen = new Map<string, number>();
  return parsed.rows.map((r) => {
    const amount = parsed.invertSign ? -r.amount : r.amount;
    let externalId: string;
    if (r.fitId) {
      externalId = `${account}|fit|${r.fitId}`;
    } else {
      const base = `${account}|${r.date}|${amount.toFixed(2)}|${normalizeLabel(r.description)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      externalId = `${base}#${n}`;
    }
    return { date: r.date, amount, description: r.description, externalId };
  });
}

export function decodeStatementText(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  const utf8 = buf.toString("utf-8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/statement.test.ts`
Expected: PASS (10 testes). Se o teste de `detectAccount` com `"extrato-c6-setembro.ofx"` falhar, revise o regex de C6 (o hífen conta como separador).

- [ ] **Step 5: Commitar**

```bash
git add src/lib/financeiro/statement.ts src/lib/financeiro/statement.test.ts
git commit -m "feat(finance): OFX/CSV statement parsing for C6 and Nubank

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Interpretador (tipos, prompt, validação e chamada ao Claude)

**Files:**
- Create: `src/lib/financeiro/capture/types.ts`
- Create: `src/lib/financeiro/capture/prompt.ts`
- Create: `src/lib/financeiro/capture/parse.ts`, `src/lib/financeiro/capture/parse.test.ts`
- Create: `src/lib/financeiro/capture/interpret.ts`
- Create: `src/lib/financeiro/capture/context.ts`
- Create: `vitest.eval.config.ts`, `src/lib/financeiro/capture/interpret.eval.ts`
- Modify: `package.json` (script `eval:finance`)

**Interfaces:**
- Consumes: `Vocab`, `matchLabel`, `normalizeLabel`, `methodsForAccount` (Task 1); `ensureFinanceSetup` (Task 1); `loadLedger`, `selectOpenItems`, `LedgerEntry` (Task 2); `todaySaoPaulo`, `round2`, `fmtBRL` (Task 1); `StatementRow` (Task 3); `ParsedStatement` (Task 6).
- Produces (em `types.ts`):

```ts
export type Channel = "telegram" | "jarvis" | "painel";
export type TxKind = "receita" | "despesa";
export type OpenItem = { ref: string; kind: TxKind; description: string; category: string; amount: number; dueDate: string | null; clientName: string | null };
export type RecentItem = { ref: string; kind: TxKind; description: string; category: string; amount: number; date: string; needsReview: boolean };
export type CaptureContext = { today: string; vocab: Vocab; openItems: OpenItem[]; recent: RecentItem[]; clients: { id: string; name: string }[] };
export type RawAction = { action: "create" | "settle" | "undo" | "recategorize" | "clarify"; kind: TxKind | null; amount: number | null; category: string | null; description: string | null; paymentMethod: string | null; date: string | null; status: "pago" | "pendente" | null; clientName: string | null; confidence: "alta" | "baixa" | null; alternatives: string[]; ref: string | null; question: string | null };
export type TxDraft = { kind: TxKind; amount: number; category: string; description: string; paymentMethod: string | null; date: string; status: "pago" | "pendente"; clientId: string | null; needsReview: boolean; alternatives: string[]; externalId: string | null };
export type CreateAction = { action: "create" } & TxDraft;
export type SettleAction = { action: "settle"; ref: string; amount: number | null; date: string; paymentMethod: string | null };
export type UndoAction = { action: "undo"; ref: string | null };
export type RecategorizeAction = { action: "recategorize"; ref: string; category: string };
export type ClarifyAction = { action: "clarify"; question: string };
export type CaptureAction = CreateAction | SettleAction | UndoAction | RecategorizeAction | ClarifyAction;
export type SettleProposal = { ref: string; date: string; amount: number | null; paymentMethod: string | null; description: string };
export type CapturedTx = TxDraft & { id: string };
export type CaptureQuestion = { pendingId: string; txId: string; question: string; options: string[] };
export type CaptureResult = { saved: CapturedTx[]; settled: { ref: string; description: string }[]; undone: string[]; recategorized: string[]; questions: CaptureQuestion[]; clarify: string[]; proposals: TxDraft[]; proposalSettles: SettleProposal[]; proposalSource: "foto" | "extrato" | null; proposalHeader: string | null; pendingConfirmationId: string | null; undoId: string | null; summary: string };
export function emptyResult(): CaptureResult;
```

  - `prompt.ts`: `INTERPRET_SYSTEM`, `INTERPRET_SCHEMA`, `CATEGORIZE_SYSTEM`, `CATEGORIZE_SCHEMA`, `PDF_SYSTEM`, `PDF_SCHEMA`, `buildContextText(ctx: CaptureContext): string`.
  - `parse.ts`: `matchClient(clients, name): string | null`, `validateCreate(a: RawAction, ctx): CreateAction | ClarifyAction`, `validateActions(raw: RawAction[], ctx): CaptureAction[]`.
  - `interpret.ts`: `FINANCE_MODELS: { capture: string; ask: string; categorize: string; document: string }` (todos `"claude-haiku-5-5"` de início), `type ImageMime`, `type InterpretInput = { kind: "text"; text: string } | { kind: "image"; imageBase64: string; mimeType: ImageMime; caption: string | null }`, `interpret(ctx, input): Promise<CaptureAction[]>`, `categorizeStatementRows(ctx, rows: StatementRow[], account: string): Promise<{ drafts: TxDraft[]; ignored: number }>`, `extractPdfStatement(base64: string): Promise<ParsedStatement>`, `class InterpretError extends Error`.
  - `context.ts`: `loadCaptureContext(userId: string): Promise<{ ctx: CaptureContext; ledger: LedgerEntry[] }>`.

- [ ] **Step 1: Criar `types.ts`**

Criar `src/lib/financeiro/capture/types.ts`:

```ts
// Tipos da captura financeira (texto, voz, foto, extrato).

import type { Vocab } from "../vocab";

export type Channel = "telegram" | "jarvis" | "painel";
export type TxKind = "receita" | "despesa";

export type OpenItem = {
  ref: string;
  kind: TxKind;
  description: string;
  category: string;
  amount: number;
  dueDate: string | null;
  clientName: string | null;
};

export type RecentItem = {
  ref: string;
  kind: TxKind;
  description: string;
  category: string;
  amount: number;
  date: string;
  needsReview: boolean;
};

export type CaptureContext = {
  today: string;
  vocab: Vocab;
  openItems: OpenItem[];
  recent: RecentItem[];
  clients: { id: string; name: string }[];
};

// Formato cru devolvido pelo modelo (todos os campos sempre presentes).
export type RawAction = {
  action: "create" | "settle" | "undo" | "recategorize" | "clarify";
  kind: TxKind | null;
  amount: number | null;
  category: string | null;
  description: string | null;
  paymentMethod: string | null;
  date: string | null;
  status: "pago" | "pendente" | null;
  clientName: string | null;
  confidence: "alta" | "baixa" | null;
  alternatives: string[];
  ref: string | null;
  question: string | null;
};

export type TxDraft = {
  kind: TxKind;
  amount: number;
  category: string;
  description: string;
  paymentMethod: string | null;
  date: string;
  status: "pago" | "pendente";
  clientId: string | null;
  needsReview: boolean;
  alternatives: string[];
  externalId: string | null;
};

export type CreateAction = { action: "create" } & TxDraft;
export type SettleAction = { action: "settle"; ref: string; amount: number | null; date: string; paymentMethod: string | null };
export type UndoAction = { action: "undo"; ref: string | null };
export type RecategorizeAction = { action: "recategorize"; ref: string; category: string };
export type ClarifyAction = { action: "clarify"; question: string };
export type CaptureAction = CreateAction | SettleAction | UndoAction | RecategorizeAction | ClarifyAction;

export type SettleProposal = {
  ref: string;
  date: string;
  amount: number | null;
  paymentMethod: string | null;
  description: string;
};

export type CapturedTx = TxDraft & { id: string };

export type CaptureQuestion = { pendingId: string; txId: string; question: string; options: string[] };

export type CaptureResult = {
  saved: CapturedTx[];
  settled: { ref: string; description: string }[];
  undone: string[];
  recategorized: string[];
  questions: CaptureQuestion[];
  clarify: string[];
  proposals: TxDraft[];
  proposalSettles: SettleProposal[];
  proposalSource: "foto" | "extrato" | null;
  proposalHeader: string | null;
  pendingConfirmationId: string | null;
  undoId: string | null;
  summary: string;
};

export function emptyResult(): CaptureResult {
  return {
    saved: [], settled: [], undone: [], recategorized: [], questions: [], clarify: [],
    proposals: [], proposalSettles: [], proposalSource: null, proposalHeader: null,
    pendingConfirmationId: null, undoId: null, summary: "",
  };
}
```

- [ ] **Step 2: Criar `prompt.ts`**

Criar `src/lib/financeiro/capture/prompt.ts`:

```ts
// Prompts e schemas do interpretador financeiro. O system prompt é estável
// (cacheável); tudo que muda por chamada vai na mensagem do usuário.

import { fmtBRL } from "../dates";
import type { CaptureContext } from "./types";

type JsonSchema = Record<string, unknown>;
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });

export const INTERPRET_SYSTEM = `Você registra o financeiro da consultoria do Fernando (FGT). Ele escreve ou fala do jeito dele: curto, informal, às vezes sem verbo, com erro de digitação ou de transcrição de voz. Entenda pelo contexto. Nunca exija frase pronta.

Para cada mensagem devolva uma lista de ações:
- create: lançamento novo. receita = dinheiro que entrou ou vai entrar; despesa = dinheiro que saiu ou vai sair.
- settle: a mensagem diz que uma conta JÁ LANÇADA foi paga ou recebida ("boleto contadora foi pago", "a Aleska pagou a parcela", "caiu o pix da Sandi"). Use o ref do item em aberto correspondente. Nunca crie lançamento novo quando um item em aberto bate com a mensagem. Se ele citar um valor diferente, mande em amount.
- undo: ele quer desfazer ou apagar algo que acabou de lançar. ref = o ref do lançamento recente que bate, ou null para o último.
- recategorize: ele está respondendo a categoria de um lançamento recente marcado "a revisar" ("é ferramenta", "era marketing"). ref = o ref do recente, category = a categoria certa.
- clarify: falta o valor, ou a mensagem não é sobre dinheiro. question = pergunta curta e direta.

Regras:
- category: SEMPRE uma das categorias da lista, escrita exatamente igual. Escolha pela natureza do gasto: mfit, Gamma, madeleads, ChatGPT/IA usado na empresa → Ferramentas e plataformas; curso, mentoria, workshop, livro → Conhecimento; anúncio, ads, Meta, impulsionar → Tráfego pago; contadora/contador → Contabilidade; DAS → Impostos Simples; retirada pessoal, terapia ou despesa pessoal paga pela empresa → Prolabore; CREF, telefone, café, escritório → Outras despesas.
- confidence "baixa" quando duas categorias são plausíveis; liste em alternatives as outras opções (até 2, da lista). Senão "alta" e alternatives [].
- paymentMethod: uma das formas da lista ou null. Pistas: "pix" numa despesa → "Pix/débito PJ"; "cartão da natália" → "Cartão crédito (Natália)"; "nubank" ou "meu cartão" → "Cartão crédito (Nubank PF)"; "no C6" ou "pix" numa receita → "Pix C6"; "link", "infinity", "maquininha" → "InfinitePay".
- status: "pago" se já aconteceu (paguei, gastei, recebi, caiu, foi pago); "pendente" se é futuro (vence dia 31, tenho que pagar, vai cair).
- date: YYYY-MM-DD. Sem data = hoje. "dia 31" = dia 31 do mês atual, ou o último dia se o mês não tiver 31. "ontem" = hoje menos 1.
- amount: número positivo em reais. "39" = 39; "1.800" ou "1800" ou "1,8 mil" = 1800; "39,90" = 39.9.
- description: curta e reconhecível ("mfit", "CREF", "Aleska — anual").
- clientName: em receita de aluno, o nome como está na lista de alunos; senão null.
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
- Transferência entre contas do próprio Fernando, pagamento de fatura de cartão, aplicação ou resgate de investimento → category "IGNORAR".
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
- closingBalance: saldo final da conta e a data dele, se o documento mostrar; senão null.
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
```

- [ ] **Step 3: Escrever o teste de `parse.ts`**

Criar `src/lib/financeiro/capture/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateActions, matchClient } from "./parse";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { CaptureContext, RawAction } from "./types";

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const ctx: CaptureContext = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  openItems: [{ ref: "tx:cont", kind: "despesa", description: "Contabilidade", category: "Contabilidade", amount: 398, dueDate: "2026-10-10", clientName: null }],
  recent: [{ ref: "tx:gpt", kind: "despesa", description: "ChatGPT", category: "Ferramentas e plataformas", amount: 57, date: "2026-10-16", needsReview: true }],
  clients: [{ id: "c1", name: "Aleska da Rosa Eli" }, { id: "c2", name: "Andressa da Rosa" }, { id: "c3", name: "Andressa Milhbeier" }],
};
const raw = (p: Partial<RawAction>): RawAction => ({
  action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas", description: "mfit",
  paymentMethod: "Pix/débito PJ", date: "2026-10-16", status: "pago", clientName: null, confidence: "alta",
  alternatives: [], ref: null, question: null, ...p,
});

describe("validateActions", () => {
  it("create claro passa direto, com nomes canônicos", () => {
    const [a] = validateActions([raw({ category: "ferramentas E plataformas", paymentMethod: "pix/debito pj" })], ctx);
    expect(a).toMatchObject({
      action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas",
      paymentMethod: "Pix/débito PJ", status: "pago", needsReview: false, alternatives: [], externalId: null,
    });
  });

  it("categoria inventada vira 'Outras despesas' marcada para revisar", () => {
    const [a] = validateActions([raw({ category: "Software" })], ctx);
    expect(a).toMatchObject({ category: "Outras despesas", needsReview: true });
  });

  it("confiança baixa marca revisão e leva a escolhida + alternativas como opções", () => {
    const [a] = validateActions([raw({ confidence: "baixa", alternatives: ["Conhecimento", "Inventada"] })], ctx);
    expect(a).toMatchObject({ needsReview: true, alternatives: ["Ferramentas e plataformas", "Conhecimento"] });
  });

  it("sem valor vira pergunta", () => {
    const [a] = validateActions([raw({ amount: null })], ctx);
    expect(a).toEqual({ action: "clarify", question: "Qual foi o valor?" });
  });

  it("forma de pagamento desconhecida vira null e data inválida vira hoje", () => {
    const [a] = validateActions([raw({ paymentMethod: "bitcoin", date: "31/10" })], ctx);
    expect(a).toMatchObject({ paymentMethod: null, date: "2026-10-16" });
  });

  it("receita liga ao aluno pelo nome parcial, mas não quando é ambíguo", () => {
    const [a, b] = validateActions([
      raw({ kind: "receita", category: "Consultoria anual", clientName: "Aleska", paymentMethod: "Pix C6" }),
      raw({ kind: "receita", category: "Consultoria anual", clientName: "Andressa", paymentMethod: "Pix C6" }),
    ], ctx);
    expect(a).toMatchObject({ clientId: "c1", paymentMethod: "Pix C6" });
    expect(b).toMatchObject({ clientId: null });
  });

  it("settle só com ref de item em aberto", () => {
    const [ok, bad] = validateActions([
      raw({ action: "settle", ref: "tx:cont", amount: 407.29 }),
      raw({ action: "settle", ref: "tx:naoexiste" }),
    ], ctx);
    expect(ok).toEqual({ action: "settle", ref: "tx:cont", amount: 407.29, date: "2026-10-16", paymentMethod: "Pix/débito PJ" });
    expect(bad.action).toBe("clarify");
  });

  it("undo aceita ref recente ou null; recategorize exige ref recente e categoria válida", () => {
    const res = validateActions([
      raw({ action: "undo", ref: "tx:gpt" }),
      raw({ action: "undo", ref: "tx:outro" }),
      raw({ action: "recategorize", ref: "tx:gpt", category: "conhecimento" }),
      raw({ action: "recategorize", ref: "tx:gpt", category: "Nada" }),
    ], ctx);
    expect(res[0]).toEqual({ action: "undo", ref: "tx:gpt" });
    expect(res[1]).toEqual({ action: "undo", ref: null });
    expect(res[2]).toEqual({ action: "recategorize", ref: "tx:gpt", category: "Conhecimento" });
    expect(res[3].action).toBe("clarify");
  });

  it("clarify usa a pergunta do modelo", () => {
    const [a] = validateActions([raw({ action: "clarify", question: "Foi pix ou cartão?" })], ctx);
    expect(a).toEqual({ action: "clarify", question: "Foi pix ou cartão?" });
  });
});

describe("matchClient", () => {
  it("exato, parcial único, ambíguo e vazio", () => {
    expect(matchClient(ctx.clients, "aleska da rosa eli")).toBe("c1");
    expect(matchClient(ctx.clients, "Milhbeier")).toBe("c3");
    expect(matchClient(ctx.clients, "Andressa")).toBeNull();
    expect(matchClient(ctx.clients, null)).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/capture/parse.test.ts`
Expected: FAIL com "Failed to resolve import ./parse".

- [ ] **Step 5: Implementar `parse.ts`**

Criar `src/lib/financeiro/capture/parse.ts`:

```ts
// Validação da saída do modelo. Nada chega ao banco sem passar por aqui:
// categorias e formas viram os nomes canônicos do vocabulário, refs precisam
// existir, valores precisam ser positivos.

import { matchLabel, normalizeLabel } from "../vocab";
import { round2 } from "../dates";
import type {
  CaptureAction, CaptureContext, ClarifyAction, CreateAction, RawAction,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function matchClient(clients: { id: string; name: string }[], name: string | null): string | null {
  if (!name || !name.trim()) return null;
  const n = normalizeLabel(name);
  const exact = clients.find((c) => normalizeLabel(c.name) === n);
  if (exact) return exact.id;
  const partial = clients.filter((c) => {
    const cn = normalizeLabel(c.name);
    return cn.includes(n) || n.includes(cn);
  });
  return partial.length === 1 ? partial[0].id : null;
}

function validDate(date: string | null, today: string): string {
  return date && DATE_RE.test(date) ? date : today;
}

export function validateCreate(a: RawAction, ctx: CaptureContext): CreateAction | ClarifyAction {
  if (!a.amount || a.amount <= 0) {
    return { action: "clarify", question: a.question?.trim() || "Qual foi o valor?" };
  }
  const kind = a.kind === "receita" ? "receita" : "despesa";
  const categories = kind === "receita"
    ? ctx.vocab.incomeCategories
    : ctx.vocab.expenseCategories.map((c) => c.name);
  const methods = (kind === "receita" ? ctx.vocab.recvMethods : ctx.vocab.payMethods).map((m) => m.name);

  const matched = matchLabel(categories, a.category);
  const others = (a.alternatives ?? [])
    .map((x) => matchLabel(categories, x))
    .filter((x): x is string => !!x && x !== matched);
  const fallback = kind === "receita"
    ? categories[0] ?? "Receita"
    : matchLabel(categories, "Outras despesas") ?? categories[0] ?? "Outras despesas";
  const category = matched ?? fallback;
  const needsReview = !matched || a.confidence === "baixa";
  const alternatives = needsReview ? [...(matched ? [matched] : []), ...others].slice(0, 3) : [];

  return {
    action: "create",
    kind,
    amount: round2(a.amount),
    category,
    description: (a.description?.trim() || category).slice(0, 120),
    paymentMethod: matchLabel(methods, a.paymentMethod),
    date: validDate(a.date, ctx.today),
    status: a.status === "pendente" ? "pendente" : "pago",
    clientId: kind === "receita" ? matchClient(ctx.clients, a.clientName) : null,
    needsReview,
    alternatives,
    externalId: null,
  };
}

export function validateActions(raw: RawAction[], ctx: CaptureContext): CaptureAction[] {
  const allMethods = [...ctx.vocab.payMethods, ...ctx.vocab.recvMethods].map((m) => m.name);
  const allCategories = [...ctx.vocab.incomeCategories, ...ctx.vocab.expenseCategories.map((c) => c.name)];
  const out: CaptureAction[] = [];

  for (const a of raw) {
    switch (a.action) {
      case "create":
        out.push(validateCreate(a, ctx));
        break;
      case "settle": {
        const ref = a.ref && ctx.openItems.some((i) => i.ref === a.ref) ? a.ref : null;
        if (!ref) {
          out.push({ action: "clarify", question: "Não achei essa conta em aberto. Me diz o valor que eu lanço." });
          break;
        }
        out.push({
          action: "settle",
          ref,
          amount: a.amount && a.amount > 0 ? round2(a.amount) : null,
          date: validDate(a.date, ctx.today),
          paymentMethod: matchLabel(allMethods, a.paymentMethod),
        });
        break;
      }
      case "undo":
        out.push({ action: "undo", ref: a.ref && ctx.recent.some((r) => r.ref === a.ref) ? a.ref : null });
        break;
      case "recategorize": {
        const category = matchLabel(allCategories, a.category);
        if (a.ref && category && ctx.recent.some((r) => r.ref === a.ref)) {
          out.push({ action: "recategorize", ref: a.ref, category });
        } else {
          out.push({ action: "clarify", question: "Qual lançamento e qual categoria?" });
        }
        break;
      }
      default:
        out.push({ action: "clarify", question: a.question?.trim() || "Não entendi. Pode repetir com o valor?" });
    }
  }
  return out;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/capture/parse.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 7: Implementar `interpret.ts`**

Criar `src/lib/financeiro/capture/interpret.ts`:

```ts
// Chamadas ao Claude do financeiro. Saída sempre estruturada (JSON schema) e
// sempre validada por parse.ts antes de qualquer gravação.

import Anthropic from "@anthropic-ai/sdk";
import type { StatementRow } from "../dedupe";
import type { ParsedStatement } from "../statement";
import { methodsForAccount } from "../vocab";
import { fmtBRL } from "../dates";
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
    rows: (out.rows ?? []).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.amount) && r.amount !== 0),
    ledgerBalance: out.closingBalance,
    isCard: !!out.isCard,
    invertSign: false,
  };
}
```

- [ ] **Step 8: Implementar `context.ts`**

Criar `src/lib/financeiro/capture/context.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { ensureFinanceSetup } from "../setup";
import { loadLedger } from "../ledgerLoader";
import { selectOpenItems, type LedgerEntry } from "../ledger";
import { isoDate, todaySaoPaulo } from "../dates";
import type { CaptureContext } from "./types";

const CAPTURE_SOURCES = ["telegram", "jarvis", "foto", "extrato"];

export async function loadCaptureContext(userId: string): Promise<{ ctx: CaptureContext; ledger: LedgerEntry[] }> {
  const vocab = await ensureFinanceSetup(userId);
  const today = todaySaoPaulo();
  const [ledger, clients, recentTxs] = await Promise.all([
    loadLedger(userId),
    prisma.client.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.financialTx.findMany({
      where: {
        updatedAt: { gte: new Date(Date.now() - 48 * 3_600_000) },
        source: { in: CAPTURE_SOURCES },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const ctx: CaptureContext = {
    today,
    vocab,
    clients,
    openItems: selectOpenItems(ledger, today).map((e) => ({
      ref: e.ref,
      kind: e.kind,
      description: e.description,
      category: e.category,
      amount: e.amount,
      dueDate: e.dueDate,
      clientName: e.clientName,
    })),
    recent: recentTxs.map((t) => ({
      ref: `tx:${t.id}`,
      kind: t.type === "receita" ? "receita" : "despesa",
      description: t.description,
      category: t.category,
      amount: t.amount,
      date: isoDate(t.paidAt ?? t.dueDate ?? t.createdAt),
      needsReview: t.needsReview,
    })),
  };
  return { ctx, ledger };
}
```

- [ ] **Step 9: Suíte de avaliação com o modelo real**

Criar `vitest.eval.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.eval.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
```

Em `package.json`, dentro de `"scripts"`, adicionar depois de `"test:watch"`:

```json
    "eval:finance": "vitest run -c vitest.eval.config.ts"
```

Criar `src/lib/financeiro/capture/interpret.eval.ts` (as frases reais da tabela 3.2 da spec):

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { extractPdfStatement, interpret, FINANCE_MODELS } from "./interpret";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { CaptureContext, CreateAction } from "./types";

// Arquivos reais do Fernando (dados pessoais): ficam fora do git, ver .gitignore.
const FIXTURES = "src/lib/financeiro/__fixtures__";
const RECEIPT = `${FIXTURES}/comprovante.jpg`;
const PDF = `${FIXTURES}/extrato.pdf`;
console.log("[eval] modelos:", FINANCE_MODELS);

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const ctx: CaptureContext = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  openItems: [
    { ref: "tx:cont", kind: "despesa", description: "Contabilidade", category: "Contabilidade", amount: 398, dueDate: "2026-10-10", clientName: null },
  ],
  recent: [
    { ref: "tx:mfit", kind: "despesa", description: "mfit", category: "Ferramentas e plataformas", amount: 39.9, date: "2026-10-16", needsReview: false },
    { ref: "tx:gpt", kind: "despesa", description: "ChatGPT", category: "Ferramentas e plataformas", amount: 57, date: "2026-10-16", needsReview: true },
  ],
  clients: [{ id: "c1", name: "Aleska da Rosa Eli" }],
};
const first = async (text: string) => (await interpret(ctx, { kind: "text", text }))[0];

describe("interpretação real — capture (gasta API)", () => {
  it("transcrição de voz por extenso", async () => {
    expect(await first("paguei trinta e nove reais de mfit no pix")).toMatchObject({
      action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas",
    });
  });
  it("é conhecimento → recategoriza o recente a revisar", async () => {
    expect(await first("o do chatgpt é conhecimento")).toEqual({ action: "recategorize", ref: "tx:gpt", category: "Conhecimento" });
  });
  it("paguei 39 mfit pix", async () => {
    expect(await first("paguei 39 mfit pix")).toMatchObject({
      action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas", paymentMethod: "Pix/débito PJ", status: "pago",
    });
  });
  it("gastei 39,90 mfit no cartão da natália", async () => {
    expect(await first("gastei 39,90 mfit no cartão da natália")).toMatchObject({
      amount: 39.9, category: "Ferramentas e plataformas", paymentMethod: "Cartão crédito (Natália)",
    });
  });
  it("boleto contadora foi pago → baixa, sem lançamento novo", async () => {
    const actions = await interpret(ctx, { kind: "text", text: "boleto contadora foi pago" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "settle", ref: "tx:cont" });
  });
  it("a contadora já tá paga, deu 407,29 → baixa com valor", async () => {
    expect(await first("a contadora já tá paga, deu 407,29")).toMatchObject({ action: "settle", ref: "tx:cont", amount: 407.29 });
  });
  it("recebi 1800 da Aleska anual no C6", async () => {
    expect(await first("recebi 1800 da Aleska anual no C6")).toMatchObject({
      action: "create", kind: "receita", amount: 1800, category: "Consultoria anual", paymentMethod: "Pix C6", clientId: "c1",
    });
  });
  it("vence dia 31 o CREF, 444 → a pagar", async () => {
    expect(await first("vence dia 31 o CREF, 444")).toMatchObject({
      action: "create", kind: "despesa", amount: 444, category: "Outras despesas", status: "pendente", date: "2026-10-31",
    });
  });
  it("chatgpt 57 cartão natália → ambíguo, a revisar", async () => {
    const a = (await first("chatgpt 57 cartão natália")) as CreateAction;
    expect(a).toMatchObject({ action: "create", amount: 57, paymentMethod: "Cartão crédito (Natália)" });
    expect(["Ferramentas e plataformas", "Conhecimento"]).toContain(a.category);
  });
  it("apaga esse do mfit → desfaz o recente", async () => {
    expect(await first("apaga esse do mfit")).toEqual({ action: "undo", ref: "tx:mfit" });
  });
});

describe("interpretação real — document (gasta API, precisa dos arquivos do Fernando)", () => {
  it.skipIf(!existsSync(RECEIPT))("comprovante vira um lançamento com valor", async () => {
    const actions = await interpret(ctx, {
      kind: "image", imageBase64: readFileSync(RECEIPT).toString("base64"), mimeType: "image/jpeg", caption: null,
    });
    const create = actions.find((a) => a.action === "create") as CreateAction | undefined;
    console.log("[eval] comprovante →", create);
    expect(create?.amount).toBeGreaterThan(0);
  });
  it.skipIf(!existsSync(PDF))("extrato em PDF: linhas com data e valor, sem inventar", async () => {
    const parsed = await extractPdfStatement(readFileSync(PDF).toString("base64"));
    console.log("[eval] PDF →", parsed.rows.length, "linhas; primeiras:", parsed.rows.slice(0, 3), "saldo:", parsed.ledgerBalance);
    expect(parsed.rows.length).toBeGreaterThan(0);
    for (const r of parsed.rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.amount).not.toBe(0);
    }
  });
});
```

Adicionar ao `.gitignore` do projeto (os arquivos de teste são documentos financeiros reais):

```
# comprovantes e extratos reais usados só na avaliação local
src/lib/financeiro/__fixtures__/
```

Os testes de documento ficam marcados como "skipped" até o Fernando colocar um comprovante (`comprovante.jpg`) e um extrato em PDF (`extrato.pdf`) nessa pasta, na Task 15. Para o PDF, além do teste passar, **confira o número de linhas e as 3 primeiras contra o PDF aberto**: é assim que se pega linha pulada ou inventada.

Run: `npm run eval:finance`
Expected: 10 PASS em "capture" e 2 skipped em "document" (gasta ~10 chamadas de API no Haiku, centavos). O caso "chatgpt" aceita qualquer uma das duas categorias de propósito: o que importa é cair numa delas.

Se algum caso de "capture" falhar:
1. Primeiro ajuste **o texto de `INTERPRET_SYSTEM`** (regras de categoria/forma), nunca o código de validação, e rode de novo. No máximo 2 rodadas de ajuste.
2. Se continuar falhando, troque `FINANCE_MODELS.capture` para `"claude-sonnet-5-5"` e rode de novo. Registre a troca na mensagem do commit (ex.: "capture usa Sonnet 5.5: Haiku errou baixa da contadora").

- [ ] **Step 10: Checar tipos, rodar a suíte e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS (a suíte `.eval.ts` não roda no `npm test`).

```bash
git add src/lib/financeiro/capture/types.ts src/lib/financeiro/capture/prompt.ts src/lib/financeiro/capture/parse.ts src/lib/financeiro/capture/parse.test.ts src/lib/financeiro/capture/interpret.ts src/lib/financeiro/capture/context.ts src/lib/financeiro/capture/interpret.eval.ts vitest.eval.config.ts package.json .gitignore
git commit -m "feat(finance): context-aware Claude interpreter for free-form capture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gravar, dar baixa, desfazer e responder (captura de texto e foto)

**Files:**
- Create: `src/lib/financeiro/capture/summary.ts`, `src/lib/financeiro/capture/summary.test.ts`
- Create: `src/lib/financeiro/capture/apply.ts`
- Create: `src/lib/financeiro/capture/run.ts`

**Interfaces:**
- Consumes: tipos da Task 7; `interpret`, `InterpretError`, `ImageMime` (Task 7); `loadCaptureContext` (Task 7); `splitRef` (Task 2); `toDbDate`, `fmtBRL`, `fmtDayMonth`, `monthLabel` (Task 1); `getDefaultUser` (`@/lib/user`).
- Produces:
  - `summary.ts`: `describeDraft(d: Pick<TxDraft, "kind" | "amount" | "category" | "paymentMethod" | "status" | "date">): string`, `summarizeCapture(r: CaptureResult): string`, `statementHeader(p: { account: string; months: string[]; novos: number; duplicados: number; baixas: number; revisar: number; ignorados: number }): string`.
  - `apply.ts`: `applyActions(actions: CaptureAction[], opts: { source: Channel; rawInput: string }): Promise<CaptureResult>`, `saveUnparsed(text: string, source: Channel): Promise<CaptureResult>`, `stageProposals(p: { drafts: TxDraft[]; settles: SettleProposal[]; source: "foto" | "extrato"; rawInput: string; snapshot: { account: string; balance: number; asOf: string } | null; header: string }): Promise<string>`, `confirmPending(pendingId: string, mode: "all" | "review"): Promise<CaptureResult>`, `discardPending(pendingId: string): Promise<boolean>`, `answerQuestion(pendingId: string, option: number): Promise<string>`, `revertUndo(undoId: string): Promise<string[]>`, `startCorrection(pendingId: string): Promise<boolean>`, `takeCorrection(): Promise<string | null>`.
  - `run.ts`: `captureText(text: string, channel: Channel): Promise<CaptureResult>`, `captureImage(imageBase64: string, mimeType: ImageMime, caption: string | null, channel: Channel): Promise<CaptureResult>`.

- [ ] **Step 1: Escrever o teste de `summary.ts`**

Criar `src/lib/financeiro/capture/summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeDraft, summarizeCapture, statementHeader } from "./summary";
import { emptyResult, type TxDraft } from "./types";

const draft = (p: Partial<TxDraft>): TxDraft => ({
  kind: "despesa", amount: 39.9, category: "Ferramentas e plataformas", description: "mfit",
  paymentMethod: "Cartão crédito (Natália)", date: "2026-10-15", status: "pago", clientId: null,
  needsReview: false, alternatives: [], externalId: null, ...p,
});
const brl = (s: string) => s.replace(/ /g, " ");

describe("summary", () => {
  it("descreve pago, recebido e a pagar", () => {
    expect(brl(describeDraft(draft({})))).toBe("R$ 39,90 · Ferramentas e plataformas · Cartão crédito (Natália) · pago · 15/10");
    expect(brl(describeDraft(draft({ kind: "receita", amount: 1800, category: "Consultoria anual", paymentMethod: "Pix C6" }))))
      .toBe("R$ 1.800,00 · Consultoria anual · Pix C6 · recebido · 15/10");
    expect(brl(describeDraft(draft({ status: "pendente", date: "2026-10-31", paymentMethod: null, category: "Outras despesas", amount: 444 }))))
      .toBe("R$ 444,00 · Outras despesas · a pagar · vence 31/10");
  });

  it("resume tudo que aconteceu numa mensagem", () => {
    const r = emptyResult();
    r.saved = [{ ...draft({}), id: "1" }, { ...draft({ needsReview: true, description: "ChatGPT", amount: 57 }), id: "2" }];
    r.settled = [{ ref: "tx:c", description: "Contabilidade" }];
    r.undone = ["mfit R$ 39,90"];
    r.questions = [{ pendingId: "p", txId: "2", question: "ChatGPT R$ 57,00: é Ferramentas e plataformas ou Conhecimento?", options: [] }];
    r.clarify = ["Qual foi o valor?"];
    const s = brl(summarizeCapture(r));
    expect(s).toContain("✅ R$ 39,90");
    expect(s).toContain("🟡 R$ 57,00");
    expect(s).toContain("✅ Baixa: Contabilidade");
    expect(s).toContain("↩️ Desfeito: mfit R$ 39,90");
    expect(s).toContain("❓ ChatGPT");
    expect(s).toContain("❓ Qual foi o valor?");
  });

  it("propostas mostram cabeçalho e cortam em 15 linhas", () => {
    const r = emptyResult();
    r.proposalHeader = "📷 Entendi do comprovante:";
    r.proposals = Array.from({ length: 17 }, () => draft({}));
    const s = summarizeCapture(r);
    expect(s.startsWith("📷 Entendi do comprovante:")).toBe(true);
    expect(s).toContain("… e mais 2");
  });

  it("nada a dizer", () => {
    expect(summarizeCapture(emptyResult())).toBe("Não registrei nada.");
  });

  it("cabeçalho do extrato", () => {
    expect(statementHeader({ account: "C6", months: ["2026-09"], novos: 32, duplicados: 4, baixas: 2, revisar: 3, ignorados: 1 }))
      .toBe("📎 Extrato C6 · setembro/2026: 32 novos, 4 já existiam, 2 baixas em contas a pagar, 3 sem categoria clara, 1 ignorado (transferências/fatura).");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/capture/summary.test.ts`
Expected: FAIL com "Failed to resolve import ./summary".

- [ ] **Step 3: Implementar `summary.ts`**

Criar `src/lib/financeiro/capture/summary.ts`:

```ts
// Textos de resposta da captura — iguais no Telegram e no Jarvis.

import { fmtBRL, fmtDayMonth, monthLabel } from "../dates";
import type { CaptureResult, TxDraft } from "./types";

export function describeDraft(
  d: Pick<TxDraft, "kind" | "amount" | "category" | "paymentMethod" | "status" | "date">,
): string {
  const parts = [fmtBRL(d.amount), d.category];
  if (d.paymentMethod) parts.push(d.paymentMethod);
  if (d.status === "pago") {
    parts.push(d.kind === "receita" ? "recebido" : "pago", fmtDayMonth(d.date));
  } else {
    parts.push(d.kind === "receita" ? "a receber" : "a pagar", `vence ${fmtDayMonth(d.date)}`);
  }
  return parts.join(" · ");
}

const MAX_PROPOSAL_LINES = 15;

export function summarizeCapture(r: CaptureResult): string {
  const lines: string[] = [];
  if (r.proposalHeader) {
    lines.push(r.proposalHeader);
    for (const p of r.proposals.slice(0, MAX_PROPOSAL_LINES)) {
      lines.push(`• ${p.description}: ${describeDraft(p)}${p.needsReview ? " 🟡" : ""}`);
    }
    if (r.proposals.length > MAX_PROPOSAL_LINES) lines.push(`… e mais ${r.proposals.length - MAX_PROPOSAL_LINES}`);
    for (const s of r.proposalSettles) lines.push(`• Baixa: ${s.description}`);
  }
  for (const s of r.saved) {
    lines.push(s.needsReview ? `🟡 ${describeDraft(s)} (pra revisar)` : `✅ ${describeDraft(s)}`);
  }
  for (const s of r.settled) lines.push(`✅ Baixa: ${s.description}`);
  for (const c of r.recategorized) lines.push(`✅ ${c}`);
  for (const u of r.undone) lines.push(`↩️ Desfeito: ${u}`);
  for (const q of r.questions) lines.push(`❓ ${q.question}`);
  for (const c of r.clarify) lines.push(`❓ ${c}`);
  return lines.length ? lines.join("\n") : "Não registrei nada.";
}

export function statementHeader(p: {
  account: string;
  months: string[];
  novos: number;
  duplicados: number;
  baixas: number;
  revisar: number;
  ignorados: number;
}): string {
  const months = p.months.map(monthLabel).join(", ");
  const parts = [`${p.novos} novos`, `${p.duplicados} já existiam`];
  if (p.baixas) parts.push(`${p.baixas} baixas em contas a pagar`);
  if (p.revisar) parts.push(`${p.revisar} sem categoria clara`);
  if (p.ignorados) parts.push(`${p.ignorados} ignorado${p.ignorados > 1 ? "s" : ""} (transferências/fatura)`);
  return `📎 Extrato ${p.account} · ${months}: ${parts.join(", ")}.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/capture/summary.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Implementar `apply.ts`**

Criar `src/lib/financeiro/capture/apply.ts`:

```ts
// Tudo que a captura grava no banco: lançamentos, baixas, perguntas,
// janela de desfazer (24h) e propostas aguardando confirmação (7 dias).

import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { splitRef } from "../ledger";
import { fmtBRL, toDbDate } from "../dates";
import { summarizeCapture } from "./summary";
import {
  emptyResult,
  type CaptureAction, type CaptureResult, type Channel, type SettleProposal, type TxDraft,
} from "./types";

const OWNER = "owner";
const HOUR = 3_600_000;

type PrevState = { status: string; paidAt: string | null; amount: number; paymentMethod: string | null };
type UndoPayload = { created: string[]; settled: { ref: string; prev: PrevState }[] };
type QuestionPayload = { txId: string; options: string[] };
type ConfirmPayload = {
  drafts: TxDraft[];
  settles: SettleProposal[];
  source: "foto" | "extrato";
  rawInput: string;
  snapshot: { account: string; balance: number; asOf: string } | null;
  header: string;
};
type CorrectionPayload = { proposalText: string };

const expiresIn = (hours: number) => new Date(Date.now() + hours * HOUR);

async function createTx(d: TxDraft, source: string, rawInput: string | null): Promise<string> {
  const tx = await prisma.financialTx.create({
    data: {
      type: d.kind,
      description: d.description,
      amount: d.amount,
      category: d.category,
      status: d.status,
      dueDate: toDbDate(d.date),
      paidAt: d.status === "pago" ? toDbDate(d.date) : null,
      paymentMethod: d.paymentMethod,
      clientId: d.clientId,
      source,
      needsReview: d.needsReview,
      rawInput,
      externalId: d.externalId,
    },
  });
  return tx.id;
}

async function settleRef(
  ref: string,
  date: string,
  amount: number | null,
  paymentMethod: string | null,
): Promise<{ description: string; prev: PrevState }> {
  const [type, id] = splitRef(ref);
  if (type === "tx") {
    const tx = await prisma.financialTx.findUniqueOrThrow({ where: { id } });
    await prisma.financialTx.update({
      where: { id },
      data: {
        status: "pago",
        paidAt: toDbDate(date),
        needsReview: false,
        ...(amount ? { amount } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    });
    return {
      description: `${tx.description} (${fmtBRL(amount ?? tx.amount)})`,
      prev: { status: tx.status, paidAt: tx.paidAt?.toISOString() ?? null, amount: tx.amount, paymentMethod: tx.paymentMethod },
    };
  }
  const inst = await prisma.installment.findUniqueOrThrow({
    where: { id },
    include: { sale: { include: { client: { select: { name: true } } } } },
  });
  await prisma.installment.update({
    where: { id },
    data: { status: "pago", paidAt: toDbDate(date), ...(paymentMethod ? { paymentMethod } : {}) },
  });
  return {
    description: `${inst.sale.client.name} — parcela ${inst.number} (${fmtBRL(inst.amount)})`,
    prev: { status: inst.status, paidAt: inst.paidAt?.toISOString() ?? null, amount: inst.amount, paymentMethod: inst.paymentMethod },
  };
}

async function restoreRef(ref: string, prev: PrevState): Promise<void> {
  const [type, id] = splitRef(ref);
  const paidAt = prev.paidAt ? new Date(prev.paidAt) : null;
  if (type === "tx") {
    await prisma.financialTx.update({
      where: { id },
      data: { status: prev.status, paidAt, amount: prev.amount, paymentMethod: prev.paymentMethod },
    });
  } else {
    await prisma.installment.update({
      where: { id },
      data: { status: prev.status, paidAt, paymentMethod: prev.paymentMethod },
    });
  }
}

async function recordUndo(payload: UndoPayload): Promise<string | null> {
  if (!payload.created.length && !payload.settled.length) return null;
  const rec = await prisma.capturePending.create({
    data: { kind: "undo", chatId: OWNER, payload, expiresAt: expiresIn(24) },
  });
  return rec.id;
}

async function askCategory(txId: string, description: string, amount: number, options: string[]) {
  const pending = await prisma.capturePending.create({
    data: { kind: "question", chatId: OWNER, payload: { txId, options } satisfies QuestionPayload, expiresAt: expiresIn(24 * 7) },
  });
  return {
    pendingId: pending.id,
    txId,
    question: `${description} ${fmtBRL(amount)}: é ${options.join(" ou ")}?`,
    options,
  };
}

async function dropQuestionsFor(txId: string): Promise<void> {
  const qs = await prisma.capturePending.findMany({ where: { chatId: OWNER, kind: "question" } });
  const ids = qs.filter((q) => (q.payload as QuestionPayload).txId === txId).map((q) => q.id);
  if (ids.length) await prisma.capturePending.deleteMany({ where: { id: { in: ids } } });
}

export async function revertUndo(undoId: string): Promise<string[]> {
  const rec = await prisma.capturePending.findUnique({ where: { id: undoId } });
  if (!rec || rec.kind !== "undo" || rec.expiresAt < new Date()) return [];
  const payload = rec.payload as UndoPayload;
  const created = await prisma.financialTx.findMany({ where: { id: { in: payload.created } } });
  await prisma.financialTx.deleteMany({ where: { id: { in: payload.created } } });
  for (const tx of created) await dropQuestionsFor(tx.id);
  for (const s of payload.settled) await restoreRef(s.ref, s.prev);
  await prisma.capturePending.delete({ where: { id: undoId } });
  return [
    ...created.map((t) => `${t.description} ${fmtBRL(t.amount)}`),
    ...payload.settled.map((s) => `baixa de ${s.ref.startsWith("inst:") ? "parcela" : "conta"} (${fmtBRL(s.prev.amount)}) voltou a ficar em aberto`),
  ];
}

async function undoMatching(ref: string | null): Promise<string[]> {
  const records = await prisma.capturePending.findMany({
    where: { chatId: OWNER, kind: "undo", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const target = ref
    ? records.find((r) => {
        const p = r.payload as UndoPayload;
        return p.created.includes(splitRef(ref)[1]) || p.settled.some((s) => s.ref === ref);
      })
    : records[0];
  return target ? revertUndo(target.id) : [];
}

export async function applyActions(
  actions: CaptureAction[],
  opts: { source: Channel; rawInput: string },
): Promise<CaptureResult> {
  const result = emptyResult();
  const undo: UndoPayload = { created: [], settled: [] };

  for (const a of actions) {
    if (a.action === "create") {
      const { action: _a, ...draft } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      const id = await createTx(draft, opts.source, opts.rawInput);
      undo.created.push(id);
      result.saved.push({ ...draft, id });
      if (draft.needsReview && draft.alternatives.length >= 2) {
        result.questions.push(await askCategory(id, draft.description, draft.amount, draft.alternatives));
      }
    } else if (a.action === "settle") {
      const { description, prev } = await settleRef(a.ref, a.date, a.amount, a.paymentMethod);
      undo.settled.push({ ref: a.ref, prev });
      result.settled.push({ ref: a.ref, description });
    } else if (a.action === "undo") {
      const undone = await undoMatching(a.ref);
      if (undone.length) result.undone.push(...undone);
      else result.clarify.push("Não achei nada recente pra desfazer (a janela é de 24h).");
    } else if (a.action === "recategorize") {
      const [, id] = splitRef(a.ref);
      const tx = await prisma.financialTx.update({ where: { id }, data: { category: a.category, needsReview: false } });
      await dropQuestionsFor(id);
      result.recategorized.push(`${tx.description} → ${a.category}`);
    } else {
      result.clarify.push(a.question);
    }
  }

  result.undoId = await recordUndo(undo);
  result.summary = summarizeCapture(result);
  return result;
}

export async function saveUnparsed(text: string, source: Channel): Promise<CaptureResult> {
  const id = await createTx(
    {
      kind: "despesa", amount: 0, category: "Outras despesas", description: text.slice(0, 80),
      paymentMethod: null, date: new Date().toISOString().slice(0, 10), status: "pendente",
      clientId: null, needsReview: true, alternatives: [], externalId: null,
    },
    source,
    text,
  );
  const result = emptyResult();
  result.undoId = await recordUndo({ created: [id], settled: [] });
  result.summary = `Não consegui entender agora, deixei pra revisar: “${text.slice(0, 80)}”`;
  return result;
}

export async function stageProposals(p: ConfirmPayload): Promise<string> {
  const rec = await prisma.capturePending.create({
    data: { kind: "confirm", chatId: OWNER, payload: p, expiresAt: expiresIn(24 * 7) },
  });
  return rec.id;
}

export async function confirmPending(pendingId: string, mode: "all" | "review"): Promise<CaptureResult> {
  const result = emptyResult();
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "confirm" || rec.expiresAt < new Date()) {
    result.clarify.push("Essa confirmação expirou. Me manda de novo.");
    result.summary = summarizeCapture(result);
    return result;
  }
  const p = rec.payload as ConfirmPayload;
  const undo: UndoPayload = { created: [], settled: [] };

  for (const d of p.drafts) {
    const draft = { ...d, needsReview: d.needsReview || mode === "review" };
    const id = await createTx(draft, p.source, p.rawInput);
    undo.created.push(id);
    result.saved.push({ ...draft, id });
  }
  for (const s of p.settles) {
    const { description, prev } = await settleRef(s.ref, s.date, s.amount, s.paymentMethod);
    undo.settled.push({ ref: s.ref, prev });
    result.settled.push({ ref: s.ref, description });
  }
  if (p.snapshot) {
    const user = await getDefaultUser();
    await prisma.bankBalanceSnapshot.create({
      data: { userId: user.id, account: p.snapshot.account, balance: p.snapshot.balance, asOf: toDbDate(p.snapshot.asOf), source: "extrato" },
    });
  }
  await prisma.capturePending.delete({ where: { id: pendingId } });

  result.undoId = await recordUndo(undo);
  result.summary = result.saved.length > 15
    ? `✅ Gravei ${result.saved.length} lançamentos e ${result.settled.length} baixas${mode === "review" ? " (todos marcados pra revisar no painel)" : ""}.`
    : summarizeCapture(result);
  return result;
}

export async function discardPending(pendingId: string): Promise<boolean> {
  const { count } = await prisma.capturePending.deleteMany({ where: { id: pendingId, kind: "confirm" } });
  return count > 0;
}

export async function answerQuestion(pendingId: string, option: number): Promise<string> {
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "question") return "Essa pergunta já foi respondida.";
  const { txId, options } = rec.payload as QuestionPayload;
  const category = options[option];
  await prisma.capturePending.delete({ where: { id: pendingId } });
  const tx = await prisma.financialTx.findUnique({ where: { id: txId } });
  if (!tx || !category) return "Esse lançamento não existe mais.";
  await prisma.financialTx.update({ where: { id: txId }, data: { category, needsReview: false } });
  return `✅ Ok: ${tx.description} → ${category}`;
}

export async function startCorrection(pendingId: string): Promise<boolean> {
  const rec = await prisma.capturePending.findUnique({ where: { id: pendingId } });
  if (!rec || rec.kind !== "confirm") return false;
  const p = rec.payload as ConfirmPayload;
  const proposalText = p.drafts.map((d) => `${d.description}: ${d.amount} · ${d.category} · ${d.paymentMethod ?? "forma ?"} · ${d.date}`).join("; ");
  await prisma.capturePending.delete({ where: { id: pendingId } });
  await prisma.capturePending.create({
    data: { kind: "correction", chatId: OWNER, payload: { proposalText } satisfies CorrectionPayload, expiresAt: expiresIn(1) },
  });
  return true;
}

export async function takeCorrection(): Promise<string | null> {
  const rec = await prisma.capturePending.findFirst({
    where: { chatId: OWNER, kind: "correction", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return null;
  await prisma.capturePending.delete({ where: { id: rec.id } });
  return (rec.payload as CorrectionPayload).proposalText;
}
```

> `payload` é `Json` no Prisma. Se `tsc` reclamar ao passar os objetos tipados em `data.payload`, faça o cast `payload as unknown as Prisma.InputJsonValue` importando `type { Prisma } from "@prisma/client"`.

- [ ] **Step 6: Implementar `run.ts`**

Criar `src/lib/financeiro/capture/run.ts`:

```ts
// Ponto de entrada da captura para Telegram, Jarvis e painel.

import { getDefaultUser } from "@/lib/user";
import { loadCaptureContext } from "./context";
import { interpret, type ImageMime } from "./interpret";
import { applyActions, saveUnparsed, stageProposals } from "./apply";
import { summarizeCapture } from "./summary";
import { emptyResult, type CaptureResult, type Channel, type SettleProposal, type TxDraft } from "./types";

export async function captureText(text: string, channel: Channel): Promise<CaptureResult> {
  const user = await getDefaultUser();
  const { ctx } = await loadCaptureContext(user.id);
  try {
    const actions = await interpret(ctx, { kind: "text", text });
    return await applyActions(actions, { source: channel, rawInput: text });
  } catch (err) {
    console.error("[finance/captureText]", err);
    return saveUnparsed(text, channel);
  }
}

export async function captureImage(
  imageBase64: string,
  mimeType: ImageMime,
  caption: string | null,
  channel: Channel,
): Promise<CaptureResult> {
  const user = await getDefaultUser();
  const { ctx } = await loadCaptureContext(user.id);
  const result = emptyResult();

  let actions;
  try {
    actions = await interpret(ctx, { kind: "image", imageBase64, mimeType, caption });
  } catch (err) {
    console.error("[finance/captureImage]", err);
    result.clarify.push("Não consegui ler esse comprovante. Me manda em texto: valor, o que foi e como pagou.");
    result.summary = summarizeCapture(result);
    return result;
  }

  const drafts: TxDraft[] = [];
  const settles: SettleProposal[] = [];
  for (const a of actions) {
    if (a.action === "create") {
      const { action: _a, ...draft } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      drafts.push(draft);
    } else if (a.action === "settle") {
      const item = ctx.openItems.find((i) => i.ref === a.ref);
      settles.push({ ref: a.ref, date: a.date, amount: a.amount, paymentMethod: a.paymentMethod, description: item?.description ?? a.ref });
    } else if (a.action === "clarify") {
      result.clarify.push(a.question);
    }
  }

  if (drafts.length || settles.length) {
    const header = "📷 Entendi do comprovante:";
    result.pendingConfirmationId = await stageProposals({
      drafts, settles, source: "foto", rawInput: caption ?? "(foto)", snapshot: null, header,
    });
    result.proposals = drafts;
    result.proposalSettles = settles;
    result.proposalSource = "foto";
    result.proposalHeader = header;
  }
  result.summary = summarizeCapture(result);
  return result;
}
```

> `channel` ainda não muda nada na foto (só o Telegram e o painel do Plano 2 mandam imagem); fica no parâmetro para manter a mesma assinatura de `captureText`. Se o lint acusar parâmetro não usado, prefixe com `_channel`.

- [ ] **Step 7: Checar tipos, rodar a suíte e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS.

```bash
git add src/lib/financeiro/capture/summary.ts src/lib/financeiro/capture/summary.test.ts src/lib/financeiro/capture/apply.ts src/lib/financeiro/capture/run.ts
git commit -m "feat(finance): apply captured actions with undo, questions and staged proposals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Captura de extrato (OFX, CSV, PDF)

**Files:**
- Create: `src/lib/financeiro/capture/statementCapture.ts`

**Interfaces:**
- Consumes: `parseOfx`, `parseCsv`, `detectAccount`, `toStatementRows`, `decodeStatementText` (Task 6); `dedupeRows` (Task 3); `categorizeStatementRows`, `extractPdfStatement` (Task 7); `loadCaptureContext` (Task 7); `stageProposals` (Task 8); `statementHeader`, `summarizeCapture` (Task 8).
- Produces: `captureStatementFile(input: { fileBase64: string; fileName: string; mimeType: string }): Promise<CaptureResult>`.

- [ ] **Step 1: Implementar `statementCapture.ts`**

Criar `src/lib/financeiro/capture/statementCapture.ts`:

```ts
// Extrato/fatura → propostas aguardando confirmação. Nada é gravado aqui.

import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import {
  decodeStatementText, detectAccount, parseCsv, parseOfx, toStatementRows, type ParsedStatement,
} from "../statement";
import { dedupeRows } from "../dedupe";
import { categorizeStatementRows, extractPdfStatement } from "./interpret";
import { loadCaptureContext } from "./context";
import { stageProposals } from "./apply";
import { statementHeader, summarizeCapture } from "./summary";
import { emptyResult, type CaptureResult, type SettleProposal } from "./types";

const UNREADABLE = "Não consegui ler esse arquivo. Me manda o extrato em OFX ou CSV (no app do banco: Extrato → Exportar).";

function clarifyResult(msg: string): CaptureResult {
  const r = emptyResult();
  r.clarify.push(msg);
  r.summary = summarizeCapture(r);
  return r;
}

export async function captureStatementFile(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<CaptureResult> {
  const user = await getDefaultUser();
  const { ctx, ledger } = await loadCaptureContext(user.id);

  const isPdf = input.mimeType === "application/pdf" || /\.pdf$/i.test(input.fileName);
  let parsed: ParsedStatement;
  let text = "";
  try {
    if (isPdf) {
      parsed = await extractPdfStatement(input.fileBase64);
    } else {
      text = decodeStatementText(input.fileBase64);
      parsed = /OFXHEADER|<OFX>/i.test(text) ? parseOfx(text) : parseCsv(text);
    }
  } catch (err) {
    console.error("[finance/statement] parse", err);
    return clarifyResult(UNREADABLE);
  }
  if (parsed.rows.length === 0) return clarifyResult(UNREADABLE);

  const account = detectAccount(input.fileName, text) ?? "Desconhecida";
  const rows = toStatementRows(parsed, account);
  const known = new Set(
    (await prisma.financialTx.findMany({
      where: { externalId: { in: rows.map((r) => r.externalId) } },
      select: { externalId: true },
    })).map((t) => t.externalId).filter((x): x is string => !!x),
  );

  const verdicts = dedupeRows(rows, ledger, known);
  const newRows = verdicts.filter((v) => v.result.verdict === "new").map((v) => v.row);
  const duplicados = verdicts.filter((v) => v.result.verdict === "duplicate").length;
  const settles: SettleProposal[] = verdicts.flatMap((v) =>
    v.result.verdict === "settles"
      ? [{
          ref: v.result.ref,
          date: v.row.date,
          amount: Math.abs(v.row.amount),
          paymentMethod: null,
          description: ledger.find((e) => e.ref === (v.result as { ref: string }).ref)?.description ?? v.result.ref,
        }]
      : [],
  );

  const { drafts, ignored } = newRows.length
    ? await categorizeStatementRows(ctx, newRows, account)
    : { drafts: [], ignored: 0 };

  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  const header = statementHeader({
    account, months, novos: drafts.length, duplicados, baixas: settles.length,
    revisar: drafts.filter((d) => d.needsReview).length, ignorados: ignored,
  });
  const snapshot = parsed.ledgerBalance && !parsed.isCard && account !== "Desconhecida"
    ? { account, balance: parsed.ledgerBalance.amount, asOf: parsed.ledgerBalance.date }
    : null;

  const result = emptyResult();
  if (!drafts.length && !settles.length && !snapshot) {
    result.summary = `${header}\nNada novo pra lançar.`;
    return result;
  }

  result.pendingConfirmationId = await stageProposals({
    drafts, settles, source: "extrato", rawInput: input.fileName, snapshot, header,
  });
  result.proposals = drafts;
  result.proposalSettles = settles;
  result.proposalSource = "extrato";
  result.proposalHeader = header;
  result.summary = summarizeCapture(result);
  if (account === "Desconhecida") {
    result.summary += "\n⚠️ Não reconheci o banco pelo arquivo; os lançamentos vão sem conta definida.";
  }
  return result;
}
```

- [ ] **Step 2: Checar tipos e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS.

```bash
git add src/lib/financeiro/capture/statementCapture.ts
git commit -m "feat(finance): statement capture with dedupe and staged confirmation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Perguntas financeiras

**Files:**
- Create: `src/lib/financeiro/ask/tools.ts`, `src/lib/financeiro/ask/tools.test.ts`
- Create: `src/lib/financeiro/ask/data.ts`
- Create: `src/lib/financeiro/ask/answer.ts`
- Create: `src/lib/financeiro/ask/answer.eval.ts`

**Interfaces:**
- Consumes: `LedgerEntry`, `entriesBetween` (Task 2); `Vocab`, `groupOfCategory`, `accountOfMethod`, `accountsOf`, `normalizeLabel`, `ExpenseGroup` (Task 1); `estimateBalance`, `latestSnapshot`, `BalanceSnapshot` (Task 5); `round2`, `isoDate`, `todaySaoPaulo` (Task 1); `ensureFinanceSetup` (Task 1); `loadLedger` (Task 2); `FINANCE_MODELS` (Task 7); `vitest.eval.config.ts` e o script `eval:finance` (Task 7).
- Produces:
  - `type AskData = { today: string; ledger: LedgerEntry[]; vocab: Vocab; snapshots: BalanceSnapshot[]; monthlyGoal: number; goals: Record<string, number> }`.
  - `openBills`, `periodSummary`, `monthResult`, `spendingByCategory`, `goalsProgress`, `balances`, `toReview`, `ASK_TOOLS: Anthropic.Tool[]`, `runAskTool(name: string, input: unknown, d: AskData): unknown`.
  - `data.ts`: `loadAskData(userId: string): Promise<AskData>`.
  - `answer.ts`: `answerFinanceQuestion(pergunta: string): Promise<string>`, `answerWithData(pergunta: string, data: AskData): Promise<string>`.

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/financeiro/ask/tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openBills, periodSummary, monthResult, spendingByCategory, goalsProgress, balances, toReview, runAskTool, type AskData } from "./tools";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { LedgerEntry } from "../ledger";

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const e = (p: Partial<LedgerEntry> & Pick<LedgerEntry, "ref">): LedgerEntry => ({
  kind: "despesa", amount: 100, category: "Outras despesas", description: "x", status: "pago", date: "2026-10-05",
  dueDate: null, paidAt: "2026-10-05", paymentMethod: "Pix/débito PJ", clientName: null, source: "manual",
  needsReview: false, ...p,
});
const data: AskData = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  snapshots: [{ account: "C6", balance: 5000, asOf: "2026-10-01" }],
  monthlyGoal: 35000,
  goals: { reserva_fin: 10000 },
  ledger: [
    e({ ref: "tx:rec", kind: "receita", amount: 10000, category: "Consultoria anual", paymentMethod: "Pix C6" }),
    e({ ref: "tx:pro", amount: 4000, category: "Prolabore" }),
    e({ ref: "tx:ads", amount: 1000, category: "Tráfego pago", paymentMethod: "Cartão crédito (Nubank PF)" }),
    e({ ref: "tx:res", amount: 500, category: "Reserva Financeira" }),
    e({ ref: "tx:cref", amount: 444, status: "pendente", date: "2026-10-31", dueDate: "2026-10-31", paidAt: null, description: "CREF" }),
    e({ ref: "tx:atras", amount: 398, status: "pendente", date: "2026-10-10", dueDate: "2026-10-10", paidAt: null, description: "Contabilidade" }),
    e({ ref: "tx:rev", amount: 57, needsReview: true, description: "ChatGPT", date: "2026-10-15", paidAt: "2026-10-15" }),
  ],
};

describe("ferramentas de leitura", () => {
  it("contas a pagar até hoje incluem as atrasadas", () => {
    const r = openBills(data, { tipo: "pagar", ate: "2026-10-16" });
    expect(r.quantidade).toBe(1);
    expect(r.itens[0]).toMatchObject({ descricao: "Contabilidade", atrasado: true });
    expect(openBills(data, { tipo: "pagar", ate: null }).total).toBe(842);
  });

  it("resumo do período soma entradas e saídas realizadas", () => {
    expect(periodSummary(data, { de: "2026-10-01", ate: "2026-10-31" })).toMatchObject({
      entradas: 10000, saidas: 5557, saldo: 4443,
    });
  });

  it("resultado do mês segue a DRE da planilha (destinação fica abaixo do resultado)", () => {
    const r = monthResult(data, { mes: "2026-10" });
    expect(r).toMatchObject({ receitas: 10000, custosFixos: 4000, investimentos: 1000, despesas: 57, destinacao: 500 });
    expect(r.resultado).toBe(4943);
    expect(r.margem).toBe(49.43);
  });

  it("gastos por categoria filtram pelo nome", () => {
    expect(spendingByCategory(data, { de: "2026-10-01", ate: "2026-10-31", categoria: "trafego" }))
      .toEqual({ total: 1000, categorias: [{ categoria: "Tráfego pago", total: 1000 }] });
  });

  it("metas: progresso do mês e reservas acumuladas", () => {
    expect(goalsProgress(data, { mes: "2026-10" })).toMatchObject({
      metaMensal: 35000, recebidoNoMes: 10000, percentual: 28.57,
      reservaFinanceira: { acumulado: 500, meta: 10000 },
    });
  });

  it("saldo estimado por conta e lançamentos a revisar", () => {
    const c6 = balances(data, { conta: "c6" }).find((b) => b.account === "C6");
    expect(c6).toMatchObject({ balance: 5000 + 10000 - 4000 - 500 - 57 });
    expect(toReview(data).itens.map((i) => i.descricao)).toEqual(["ChatGPT"]);
  });

  it("runAskTool despacha pelo nome e acusa ferramenta desconhecida", () => {
    expect(runAskTool("contas_em_aberto", { tipo: "pagar", ate: "2026-10-16" }, data)).toMatchObject({ quantidade: 1 });
    expect(runAskTool("nao_existe", {}, data)).toEqual({ erro: "ferramenta desconhecida: nao_existe" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/ask/tools.test.ts`
Expected: FAIL com "Failed to resolve import ./tools".

- [ ] **Step 3: Implementar `tools.ts`**

Criar `src/lib/financeiro/ask/tools.ts`:

```ts
// Ferramentas de leitura que o modelo usa para responder perguntas financeiras.
// Funções puras sobre o livro-razão: o modelo nunca vê o banco direto.

import type Anthropic from "@anthropic-ai/sdk";
import { entriesBetween, type LedgerEntry } from "../ledger";
import {
  accountOfMethod, accountsOf, groupOfCategory, normalizeLabel, type ExpenseGroup, type Vocab,
} from "../vocab";
import { estimateBalance, latestSnapshot, type BalanceSnapshot } from "../balance";
import { round2 } from "../dates";

export type AskData = {
  today: string;
  ledger: LedgerEntry[];
  vocab: Vocab;
  snapshots: BalanceSnapshot[];
  monthlyGoal: number;
  goals: Record<string, number>;
};

const sum = (xs: LedgerEntry[]) => round2(xs.reduce((s, e) => s + e.amount, 0));
const realized = (d: AskData) => d.ledger.filter((e) => e.status === "pago");

export function openBills(d: AskData, p: { tipo: "pagar" | "receber" | "ambos"; ate: string | null }) {
  const kinds = p.tipo === "pagar" ? ["despesa"] : p.tipo === "receber" ? ["receita"] : ["despesa", "receita"];
  const items = d.ledger
    .filter((e) => e.status === "pendente" && kinds.includes(e.kind))
    .filter((e) => !p.ate || (e.dueDate ?? e.date) <= p.ate)
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date));
  return {
    total: sum(items),
    quantidade: items.length,
    itens: items.slice(0, 40).map((e) => ({
      descricao: e.description,
      categoria: e.category,
      valor: e.amount,
      vencimento: e.dueDate ?? e.date,
      tipo: e.kind === "despesa" ? "pagar" : "receber",
      atrasado: (e.dueDate ?? e.date) < d.today,
      cliente: e.clientName,
    })),
  };
}

export function periodSummary(d: AskData, p: { de: string; ate: string }) {
  const xs = entriesBetween(realized(d), p.de, p.ate);
  const entradas = sum(xs.filter((e) => e.kind === "receita"));
  const saidas = sum(xs.filter((e) => e.kind === "despesa"));
  return { de: p.de, ate: p.ate, entradas, saidas, saldo: round2(entradas - saidas), lancamentos: xs.length };
}

export function monthResult(d: AskData, p: { mes: string }) {
  const xs = realized(d).filter((e) => e.date.startsWith(p.mes));
  const receitas = sum(xs.filter((e) => e.kind === "receita"));
  const byGroup: Record<ExpenseGroup, number> = { fixo: 0, variavel: 0, despesa: 0, investimento: 0, destinacao: 0 };
  for (const e of xs.filter((x) => x.kind === "despesa")) {
    byGroup[groupOfCategory(d.vocab, e.category) ?? "despesa"] += e.amount;
  }
  const custos = byGroup.fixo + byGroup.variavel + byGroup.despesa + byGroup.investimento;
  const resultado = round2(receitas - custos);
  return {
    mes: p.mes,
    receitas,
    custosFixos: round2(byGroup.fixo),
    custosVariaveis: round2(byGroup.variavel),
    despesas: round2(byGroup.despesa),
    investimentos: round2(byGroup.investimento),
    resultado,
    margem: receitas ? round2((resultado / receitas) * 100) : null,
    pctCustos: receitas ? round2((custos / receitas) * 100) : null,
    destinacao: round2(byGroup.destinacao),
  };
}

export function spendingByCategory(d: AskData, p: { de: string; ate: string; categoria: string | null }) {
  const filter = p.categoria ? normalizeLabel(p.categoria) : null;
  const xs = entriesBetween(realized(d), p.de, p.ate)
    .filter((e) => e.kind === "despesa")
    .filter((e) => !filter || normalizeLabel(e.category).includes(filter));
  const map = new Map<string, number>();
  for (const e of xs) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  const categorias = [...map.entries()]
    .map(([categoria, total]) => ({ categoria, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  return { total: sum(xs), categorias };
}

export function goalsProgress(d: AskData, p: { mes: string }) {
  const recebidoNoMes = monthResult(d, p).receitas;
  const acumulado = (cat: string) =>
    sum(realized(d).filter((e) => e.kind === "despesa" && normalizeLabel(e.category) === normalizeLabel(cat)));
  return {
    metaMensal: d.monthlyGoal,
    recebidoNoMes,
    percentual: d.monthlyGoal ? round2((recebidoNoMes / d.monthlyGoal) * 100) : null,
    faltam: round2(Math.max(d.monthlyGoal - recebidoNoMes, 0)),
    reservaFinanceira: { acumulado: acumulado("Reserva Financeira"), meta: d.goals.reserva_fin ?? null },
    reservaOportunidades: { acumulado: acumulado("Reserva de oportunidades"), meta: d.goals.reserva_oport ?? null },
    capitalDeGiro: { meta: d.goals.cap_giro ?? null, observacao: "realizado do capital de giro não é registrado no sistema" },
  };
}

export function balances(d: AskData, p: { conta: string | null }) {
  const accounts = accountsOf(d.vocab).filter(
    (a) => !p.conta || normalizeLabel(a).includes(normalizeLabel(p.conta)),
  );
  return accounts.map((account) =>
    estimateBalance(account, latestSnapshot(d.snapshots, account), d.ledger, (m) => accountOfMethod(d.vocab, m)),
  );
}

export function toReview(d: AskData) {
  const xs = d.ledger.filter((e) => e.needsReview);
  return {
    quantidade: xs.length,
    itens: xs.slice(0, 30).map((e) => ({ descricao: e.description, valor: e.amount, categoria: e.category, data: e.date })),
  };
}

const dateParam = { anyOf: [{ type: "string", description: "YYYY-MM-DD" }, { type: "null" }] };

export const ASK_TOOLS: Anthropic.Tool[] = [
  {
    name: "contas_em_aberto",
    description: "Contas a pagar e/ou a receber ainda em aberto, com vencimento e se estão atrasadas. Use 'ate' = hoje para 'o que pagar hoje' (inclui atrasadas), o fim da semana para 'essa semana', ou null para todas.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["tipo", "ate"],
      properties: { tipo: { type: "string", enum: ["pagar", "receber", "ambos"] }, ate: dateParam },
    },
  },
  {
    name: "saldo_estimado",
    description: "Saldo estimado por conta (último extrato enviado + lançamentos depois). conta = null para todas.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["conta"],
      properties: { conta: { anyOf: [{ type: "string" }, { type: "null" }] } },
    },
  },
  {
    name: "resumo_periodo",
    description: "Entradas, saídas e saldo realizados entre duas datas (inclusive).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["de", "ate"],
      properties: { de: { type: "string" }, ate: { type: "string" } },
    },
  },
  {
    name: "resultado_mes",
    description: "Resultado do mês no formato da planilha: receitas, custos fixos, variáveis, despesas, investimentos, resultado, margem e % de custos. mes = YYYY-MM.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["mes"],
      properties: { mes: { type: "string" } },
    },
  },
  {
    name: "progresso_metas",
    description: "Progresso da meta de faturamento do mês e das reservas (financeira, oportunidades, capital de giro). mes = YYYY-MM.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["mes"],
      properties: { mes: { type: "string" } },
    },
  },
  {
    name: "gastos_por_categoria",
    description: "Gastos realizados por categoria num período. categoria = parte do nome para filtrar, ou null para todas.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["de", "ate", "categoria"],
      properties: { de: { type: "string" }, ate: { type: "string" }, categoria: { anyOf: [{ type: "string" }, { type: "null" }] } },
    },
  },
  {
    name: "lancamentos_a_revisar",
    description: "Lançamentos marcados para revisão (categoria incerta ou mensagem não entendida).",
    input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
];

const str = (input: unknown, key: string): string | null => {
  const v = (input as Record<string, unknown> | null)?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export function runAskTool(name: string, input: unknown, d: AskData): unknown {
  const month = d.today.slice(0, 7);
  switch (name) {
    case "contas_em_aberto": {
      const tipo = str(input, "tipo");
      return openBills(d, { tipo: tipo === "receber" || tipo === "ambos" ? tipo : "pagar", ate: str(input, "ate") });
    }
    case "saldo_estimado":
      return balances(d, { conta: str(input, "conta") });
    case "resumo_periodo":
      return periodSummary(d, { de: str(input, "de") ?? `${month}-01`, ate: str(input, "ate") ?? d.today });
    case "resultado_mes":
      return monthResult(d, { mes: str(input, "mes") ?? month });
    case "progresso_metas":
      return goalsProgress(d, { mes: str(input, "mes") ?? month });
    case "gastos_por_categoria":
      return spendingByCategory(d, {
        de: str(input, "de") ?? `${month}-01`,
        ate: str(input, "ate") ?? d.today,
        categoria: str(input, "categoria"),
      });
    case "lancamentos_a_revisar":
      return toReview(d);
    default:
      return { erro: `ferramenta desconhecida: ${name}` };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/ask/tools.test.ts`
Expected: PASS (7 testes). Conferência manual do caso de saldo: C6 = 5000 + 10000 (Pix C6) − 4000 − 500 − 57 (Pix/débito PJ); Tráfego (Nubank) e pendentes ficam fora.

- [ ] **Step 5: Implementar `data.ts`**

Criar `src/lib/financeiro/ask/data.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { ensureFinanceSetup } from "../setup";
import { loadLedger } from "../ledgerLoader";
import { isoDate, todaySaoPaulo } from "../dates";
import type { AskData } from "./tools";

const DEFAULT_MONTHLY_GOAL = 35000;

export async function loadAskData(userId: string): Promise<AskData> {
  const vocab = await ensureFinanceSetup(userId);
  const [ledger, snapshots, goalRows] = await Promise.all([
    loadLedger(userId),
    prisma.bankBalanceSnapshot.findMany({ where: { userId }, orderBy: { asOf: "desc" } }),
    prisma.financialConfig.findMany({ where: { userId, type: "goal" } }),
  ]);
  const goals: Record<string, number> = {};
  for (const g of goalRows) {
    const v = Number(g.value);
    if (g.key && Number.isFinite(v)) goals[g.key] = v;
  }
  return {
    today: todaySaoPaulo(),
    ledger,
    vocab,
    snapshots: snapshots.map((s) => ({ account: s.account, balance: s.balance, asOf: isoDate(s.asOf) })),
    monthlyGoal: goals.rec_mensal ?? DEFAULT_MONTHLY_GOAL,
    goals,
  };
}
```

- [ ] **Step 6: Implementar `answer.ts`**

Criar `src/lib/financeiro/ask/answer.ts`:

```ts
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
```

- [ ] **Step 7: Avaliação real das perguntas (Haiku)**

Criar `src/lib/financeiro/ask/answer.eval.ts`. Usa os mesmos dados sintéticos do `tools.test.ts`, então cada resposta tem um número certo conhecido:

```ts
import { describe, it, expect } from "vitest";
import { answerWithData } from "./answer";
import type { AskData } from "./tools";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { LedgerEntry } from "../ledger";

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const e = (p: Partial<LedgerEntry> & Pick<LedgerEntry, "ref">): LedgerEntry => ({
  kind: "despesa", amount: 100, category: "Outras despesas", description: "x", status: "pago", date: "2026-10-05",
  dueDate: null, paidAt: "2026-10-05", paymentMethod: "Pix/débito PJ", clientName: null, source: "manual",
  needsReview: false, ...p,
});
const data: AskData = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  snapshots: [{ account: "C6", balance: 5000, asOf: "2026-10-01" }],
  monthlyGoal: 35000,
  goals: { reserva_fin: 10000 },
  ledger: [
    e({ ref: "tx:rec", kind: "receita", amount: 10000, category: "Consultoria anual", paymentMethod: "Pix C6" }),
    e({ ref: "tx:pro", amount: 4000, category: "Prolabore" }),
    e({ ref: "tx:ads", amount: 1000, category: "Tráfego pago", paymentMethod: "Cartão crédito (Nubank PF)" }),
    e({ ref: "tx:res", amount: 500, category: "Reserva Financeira" }),
    e({ ref: "tx:cref", amount: 444, status: "pendente", date: "2026-10-31", dueDate: "2026-10-31", paidAt: null, description: "CREF" }),
    e({ ref: "tx:atras", amount: 398, status: "pendente", date: "2026-10-10", dueDate: "2026-10-10", paidAt: null, description: "Contabilidade" }),
  ],
};
// Aceita "398", "398,00" e "R$ 398" — o que importa é o número certo aparecer.
const has = (text: string, n: string) => text.replace(/\./g, "").includes(n);

describe("perguntas reais — ask (gasta API)", () => {
  it("o que temos que pagar hoje? → só a Contabilidade atrasada", async () => {
    const t = await answerWithData("o que temos que pagar hoje?", data);
    console.log("[eval]", t);
    expect(t).toMatch(/contabilidade/i);
    expect(has(t, "398")).toBe(true);
    expect(t).not.toMatch(/cref/i);
  });
  it("quais contas estão em aberto? → as duas, total 842", async () => {
    const t = await answerWithData("quais contas estão em aberto?", data);
    console.log("[eval]", t);
    expect(t).toMatch(/cref/i);
    expect(t).toMatch(/contabilidade/i);
  });
  it("qual nosso saldo no C6? → 10.500 estimado, citando a base", async () => {
    // 5.000 (extrato de 01/10) + 10.000 (Pix C6) − 4.000 (prolabore) − 500 (reserva)
    const t = await answerWithData("qual nosso saldo no C6?", data);
    console.log("[eval]", t);
    expect(has(t, "10500")).toBe(true);
    expect(t).toMatch(/estimad/i);
  });
  it("qual o resultado do mês? → 5.000", async () => {
    // 10.000 de receita − 4.000 fixo − 1.000 investimento; reserva fica abaixo do resultado
    const t = await answerWithData("qual o resultado do mês?", data);
    console.log("[eval]", t);
    expect(has(t, "5000")).toBe(true);
  });
  it("quanto falta pra meta? → 25.000", async () => {
    const t = await answerWithData("quanto falta pra bater a meta do mês?", data);
    console.log("[eval]", t);
    expect(has(t, "25000")).toBe(true);
  });
});
```

Run: `npm run eval:finance`
Expected: os 5 casos de "ask" PASS (além dos da Task 7). Leia também as respostas impressas: precisam soar naturais para serem faladas pelo Jarvis.

Se algum falhar:
1. Ajuste primeiro o `systemPrompt` de `answer.ts` ou a `description` da ferramenta envolvida. No máximo 2 rodadas.
2. Se continuar falhando, troque `FINANCE_MODELS.ask` para `"claude-sonnet-5-5"`, rode de novo e registre a troca na mensagem do commit.

- [ ] **Step 8: Checar tipos, rodar a suíte e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS.

```bash
git add src/lib/financeiro/ask
git commit -m "feat(finance): finance Q&A with read-only ledger tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Rotas `/api/op/finance/*` (porta do Jarvis)

**Files:**
- Create: `src/lib/opAuth.ts`
- Create: `src/app/api/op/finance/capture/route.ts`
- Create: `src/app/api/op/finance/ask/route.ts`

**Interfaces:**
- Consumes: `captureText`, `captureImage` (Task 8); `captureStatementFile` (Task 9); `answerFinanceQuestion` (Task 10); `ImageMime` (Task 7).
- Produces:
  - `isOpAuthorized(req: NextRequest): boolean`.
  - `POST /api/op/finance/capture` — corpo `{ kind: "text", text, channel? } | { kind: "image", imageBase64, mimeType, caption?, channel? } | { kind: "file", fileBase64, fileName, mimeType, channel? }` → `CaptureResult & { text: string }`.
  - `POST /api/op/finance/ask` — corpo `{ pergunta: string }` → `{ text: string }`.

- [ ] **Step 1: Implementar `opAuth.ts`**

Criar `src/lib/opAuth.ts`:

```ts
import type { NextRequest } from "next/server";

// Mesmo contrato das rotas /api/op/* existentes: Bearer OP_INTERNAL_SECRET.
export function isOpAuthorized(req: NextRequest): boolean {
  const secret = process.env.OP_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const [scheme, token] = (req.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token === secret;
}
```

- [ ] **Step 2: Implementar a rota de captura**

Criar `src/app/api/op/finance/capture/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isOpAuthorized } from "@/lib/opAuth";
import { captureImage, captureText } from "@/lib/financeiro/capture/run";
import { captureStatementFile } from "@/lib/financeiro/capture/statementCapture";
import type { ImageMime } from "@/lib/financeiro/capture/interpret";
import type { Channel } from "@/lib/financeiro/capture/types";

export const maxDuration = 300;

const IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  if (!isOpAuthorized(req)) {
    return NextResponse.json({ text: "Não autorizado." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const channel: Channel = body?.channel === "jarvis" ? "jarvis" : body?.channel === "painel" ? "painel" : "telegram";

  try {
    let result;
    if (body?.kind === "text" && typeof body.text === "string" && body.text.trim()) {
      result = await captureText(body.text.trim(), channel);
    } else if (body?.kind === "image" && typeof body.imageBase64 === "string" && IMAGE_MIMES.includes(body.mimeType)) {
      result = await captureImage(body.imageBase64, body.mimeType, typeof body.caption === "string" ? body.caption : null, channel);
    } else if (body?.kind === "file" && typeof body.fileBase64 === "string" && typeof body.fileName === "string") {
      result = await captureStatementFile({ fileBase64: body.fileBase64, fileName: body.fileName, mimeType: String(body.mimeType ?? "") });
    } else {
      return NextResponse.json(
        { text: 'Payload inválido. Envie { "kind": "text", "text": "..." }.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ...result, text: result.summary });
  } catch (err) {
    console.error("[POST /api/op/finance/capture]", err);
    const msg = err instanceof Error ? err.message : "erro inesperado";
    return NextResponse.json({ text: `Falha ao registrar no financeiro: ${msg}` }, { status: 500 });
  }
}
```

- [ ] **Step 3: Implementar a rota de perguntas**

Criar `src/app/api/op/finance/ask/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isOpAuthorized } from "@/lib/opAuth";
import { answerFinanceQuestion } from "@/lib/financeiro/ask/answer";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!isOpAuthorized(req)) {
    return NextResponse.json({ text: "Não autorizado." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const pergunta = typeof body?.pergunta === "string" ? body.pergunta.trim() : "";
  if (!pergunta) {
    return NextResponse.json({ text: 'Payload inválido. Envie { "pergunta": "..." }.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ text: await answerFinanceQuestion(pergunta) });
  } catch (err) {
    console.error("[POST /api/op/finance/ask]", err);
    return NextResponse.json({ text: "Não consegui consultar o financeiro agora." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Testar as rotas localmente contra o banco**

`/api/op/*` já é liberado no `proxy.ts` (linha 18), então não precisa de Basic Auth.

Run (terminal 1): `npm run dev`
Run (terminal 2):

```bash
SECRET=$(grep '^OP_INTERNAL_SECRET=' .env.local .env 2>/dev/null | head -1 | cut -d= -f2-)
curl -s -X POST localhost:3000/api/op/finance/ask -H "Authorization: Bearer $SECRET" -H 'Content-Type: application/json' -d '{"pergunta":"quais contas estão em aberto?"}' | jq .text
curl -s -X POST localhost:3000/api/op/finance/capture -H 'Content-Type: application/json' -d '{"kind":"text","text":"x"}' | jq .
```

Expected: a primeira devolve um texto em português listando as contas (ou dizendo que não há nenhuma); a segunda devolve `{"text":"Não autorizado."}`.

**Não** rode uma captura de texto real aqui: ela grava no banco de produção. O teste de ponta a ponta com gravação é a Task 15, feito junto com o Fernando.

- [ ] **Step 5: Commitar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos.

```bash
git add src/lib/opAuth.ts src/app/api/op/finance
git commit -m "feat(op): finance capture and ask endpoints for Jarvis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Telegram — foto, arquivo, botões e intents financeiras

**Files:**
- Modify: `src/lib/telegram.ts`
- Create: `src/lib/financeiro/capture/telegramUi.ts`, `src/lib/financeiro/capture/telegramUi.test.ts`
- Create: `src/lib/financeiro/capture/callbacks.ts`
- Modify: `src/lib/openclaw/types.ts`
- Modify: `src/lib/openclaw/classifier.ts`
- Modify: `src/lib/openclaw/engine.ts`
- Modify: `src/app/api/telegram/route.ts`

**Interfaces:**
- Consumes: `captureText`, `captureImage` (Task 8); `captureStatementFile` (Task 9); `answerFinanceQuestion` (Task 10); `confirmPending`, `discardPending`, `answerQuestion`, `revertUndo`, `startCorrection`, `takeCorrection` (Task 8); `CaptureResult` (Task 7).
- Produces:
  - `telegram.ts`: `type TelegramButton = { text: string; callback_data: string }`, `sendTelegramMessage(chatId, text, opts?: { buttons?: TelegramButton[][] })` (Markdown com fallback para texto puro), `answerCallbackQuery(id: string, text?: string)`, `downloadTelegramFile(fileId: string): Promise<{ base64: string; filePath: string } | null>`.
  - `telegramUi.ts`: `type FinanceCallback`, `buildCaptureButtons(r: CaptureResult): TelegramButton[][]`, `parseFinanceCallback(data: string): FinanceCallback | null`.
  - `callbacks.ts`: `handleFinanceCallback(cb: FinanceCallback): Promise<{ text: string; buttons: TelegramButton[][] }>`.
  - `OCIntent` ganha `"finance_capture" | "finance_ask"`; `OCProcessResult` ganha `buttons?: TelegramButton[][]`.

- [ ] **Step 1: Escrever o teste de `telegramUi.ts`**

Criar `src/lib/financeiro/capture/telegramUi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCaptureButtons, parseFinanceCallback } from "./telegramUi";
import { emptyResult } from "./types";

const ID = "clz1234567890abcdefghijkl";

describe("telegramUi", () => {
  it("foto tem Gravar, Corrigir, Revisar e Descartar", () => {
    const r = { ...emptyResult(), pendingConfirmationId: ID, proposalSource: "foto" as const };
    expect(buildCaptureButtons(r).flat().map((b) => b.text)).toEqual(["✅ Gravar", "✏️ Corrigir", "👀 Revisar no painel", "🗑️ Descartar"]);
  });

  it("extrato não tem Corrigir", () => {
    const r = { ...emptyResult(), pendingConfirmationId: ID, proposalSource: "extrato" as const };
    expect(buildCaptureButtons(r).flat().map((b) => b.text)).toEqual(["✅ Gravar todos", "👀 Revisar no painel", "🗑️ Descartar"]);
  });

  it("pergunta vira uma linha de opções e desfazer vem por último", () => {
    const r = { ...emptyResult(), undoId: ID, questions: [{ pendingId: ID, txId: "t", question: "?", options: ["Ferramentas e plataformas", "Conhecimento"] }] };
    const rows = buildCaptureButtons(r);
    expect(rows[0].map((b) => b.callback_data)).toEqual([`fq:${ID}:0`, `fq:${ID}:1`]);
    expect(rows[1]).toEqual([{ text: "↩️ Desfazer", callback_data: `fu:${ID}` }]);
  });

  it("todo callback_data cabe nos 64 bytes do Telegram", () => {
    const r = { ...emptyResult(), pendingConfirmationId: ID, proposalSource: "foto" as const, undoId: ID };
    for (const b of buildCaptureButtons(r).flat()) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
  });

  it("parse ida e volta, e ignora dados de outros fluxos", () => {
    expect(parseFinanceCallback(`fc:${ID}:review`)).toEqual({ type: "confirm", pendingId: ID, mode: "review" });
    expect(parseFinanceCallback(`fq:${ID}:1`)).toEqual({ type: "answer", pendingId: ID, option: 1 });
    expect(parseFinanceCallback(`fu:${ID}`)).toEqual({ type: "undo", undoId: ID });
    expect(parseFinanceCallback(`fc:${ID}:hack`)).toBeNull();
    expect(parseFinanceCallback("outro:coisa")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/capture/telegramUi.test.ts`
Expected: FAIL com "Failed to resolve import ./telegramUi".

- [ ] **Step 3: Atualizar `src/lib/telegram.ts`**

Substituir o arquivo inteiro por:

```ts
/**
 * Envio de mensagem pro Telegram — usado pelo webhook (resposta a comando)
 * e pelos crons do Jarvis (mensagem proativa, sem comando do usuário).
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export type TelegramButton = { text: string; callback_data: string };

async function postMessage(body: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts: { buttons?: TelegramButton[][] } = {},
): Promise<void> {
  if (!BOT_TOKEN) {
    console.log(`[Telegram] BOT_TOKEN não configurado. Resposta seria:\n${text}`);
    return;
  }
  const base: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.buttons?.length) base.reply_markup = { inline_keyboard: opts.buttons };
  try {
    const res = await postMessage({ ...base, parse_mode: "Markdown" });
    // Texto do usuário com "_" ou "*" quebra o Markdown do Telegram (400):
    // reenviar sem formatação em vez de perder a mensagem.
    if (res.status === 400) await postMessage(base);
  } catch (err) {
    console.error("[Telegram] Erro ao enviar mensagem:", err);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
    });
  } catch (err) {
    console.error("[Telegram] Erro em answerCallbackQuery:", err);
  }
}

export async function downloadTelegramFile(fileId: string): Promise<{ base64: string; filePath: string } | null> {
  if (!BOT_TOKEN) return null;
  const meta = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = json.result?.file_path;
  if (!json.ok || !filePath) return null;
  const file = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
  if (!file.ok) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  return { base64: buf.toString("base64"), filePath };
}
```

- [ ] **Step 4: Implementar `telegramUi.ts`**

Criar `src/lib/financeiro/capture/telegramUi.ts`:

```ts
// Botões do Telegram para a captura. callback_data curto: fc | fq | fu.

import type { TelegramButton } from "@/lib/telegram";
import type { CaptureResult } from "./types";

export type FinanceCallback =
  | { type: "confirm"; pendingId: string; mode: "all" | "review" | "discard" | "fix" }
  | { type: "answer"; pendingId: string; option: number }
  | { type: "undo"; undoId: string };

export function buildCaptureButtons(r: CaptureResult): TelegramButton[][] {
  const rows: TelegramButton[][] = [];
  if (r.pendingConfirmationId) {
    const id = r.pendingConfirmationId;
    if (r.proposalSource === "foto") {
      rows.push([
        { text: "✅ Gravar", callback_data: `fc:${id}:all` },
        { text: "✏️ Corrigir", callback_data: `fc:${id}:fix` },
      ]);
    } else {
      rows.push([{ text: "✅ Gravar todos", callback_data: `fc:${id}:all` }]);
    }
    rows.push([
      { text: "👀 Revisar no painel", callback_data: `fc:${id}:review` },
      { text: "🗑️ Descartar", callback_data: `fc:${id}:discard` },
    ]);
  }
  for (const q of r.questions) {
    rows.push(q.options.map((o, i) => ({ text: o, callback_data: `fq:${q.pendingId}:${i}` })));
  }
  if (r.undoId) rows.push([{ text: "↩️ Desfazer", callback_data: `fu:${r.undoId}` }]);
  return rows;
}

const MODES = ["all", "review", "discard", "fix"] as const;

export function parseFinanceCallback(data: string): FinanceCallback | null {
  const [prefix, id, extra] = data.split(":");
  if (!id) return null;
  if (prefix === "fc" && (MODES as readonly string[]).includes(extra)) {
    return { type: "confirm", pendingId: id, mode: extra as (typeof MODES)[number] };
  }
  if (prefix === "fq" && /^\d+$/.test(extra ?? "")) return { type: "answer", pendingId: id, option: Number(extra) };
  if (prefix === "fu" && extra === undefined) return { type: "undo", undoId: id };
  return null;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/capture/telegramUi.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Implementar `callbacks.ts`**

Criar `src/lib/financeiro/capture/callbacks.ts`:

```ts
import type { TelegramButton } from "@/lib/telegram";
import {
  answerQuestion, confirmPending, discardPending, revertUndo, startCorrection,
} from "./apply";
import { buildCaptureButtons, type FinanceCallback } from "./telegramUi";

export async function handleFinanceCallback(cb: FinanceCallback): Promise<{ text: string; buttons: TelegramButton[][] }> {
  if (cb.type === "answer") {
    return { text: await answerQuestion(cb.pendingId, cb.option), buttons: [] };
  }
  if (cb.type === "undo") {
    const undone = await revertUndo(cb.undoId);
    return {
      text: undone.length ? `↩️ Desfeito:\n${undone.map((u) => `• ${u}`).join("\n")}` : "Nada pra desfazer (a janela é de 24h).",
      buttons: [],
    };
  }
  switch (cb.mode) {
    case "discard":
      return { text: (await discardPending(cb.pendingId)) ? "🗑️ Descartei." : "Isso já tinha sido resolvido.", buttons: [] };
    case "fix":
      return {
        text: (await startCorrection(cb.pendingId))
          ? "Beleza, me manda o certo em texto (ex: \"era marketing, 1.094,67 no nubank\")."
          : "Isso já tinha sido resolvido.",
        buttons: [],
      };
    default: {
      const result = await confirmPending(cb.pendingId, cb.mode);
      return { text: result.summary, buttons: buildCaptureButtons(result) };
    }
  }
}
```

- [ ] **Step 7: Intents financeiras no OpenClaw**

Em `src/lib/openclaw/types.ts`:

1. No topo, adicionar: `import type { TelegramButton } from "@/lib/telegram";`
2. Em `OCIntent`, antes de `| "unknown"`, adicionar:

```ts
  | "finance_capture"
  | "finance_ask"
```

3. Em `OCProcessResult`, depois de `waitingConfirmation?: boolean;`, adicionar:

```ts
  buttons?: TelegramButton[][];
```

Em `src/lib/openclaw/classifier.ts`, no `systemPrompt`:

1. Substituir o bloco inteiro de `register_payment → {...}` (as 3 linhas) por:

```
register_payment → (não use mais: pagamento de aluno agora é finance_capture)
```

2. Logo antes da linha `unknown → {}`, inserir:

```
finance_capture → {}
  - qualquer mensagem que registra dinheiro entrando ou saindo, conta a pagar ou a receber, baixa de conta, pagamento de aluno, correção de categoria ou "desfaz" de lançamento financeiro. Exemplos de intenção (não frases obrigatórias): "paguei 39 mfit pix", "boleto contadora foi pago", "recebi 1800 da Aleska anual no C6", "Camila pagou 300 no pix", "vence dia 31 o CREF 444", "é ferramenta", "desfaz o último".

finance_ask → {}
  - perguntas sobre dinheiro da empresa: contas em aberto, o que pagar hoje ou na semana, saldo, quanto entrou, saiu ou sobrou, resultado do mês, meta de faturamento, reservas, gastos por categoria, o que está pra revisar.
  - "quem não pagou", "inadimplentes" e cobrança de alunos continuam sendo query_pending.
```

Em `src/lib/openclaw/engine.ts`:

1. Nos imports, adicionar:

```ts
import { captureText } from "@/lib/financeiro/capture/run";
import { buildCaptureButtons } from "@/lib/financeiro/capture/telegramUi";
import { answerFinanceQuestion } from "@/lib/financeiro/ask/answer";
import type { TelegramButton } from "@/lib/telegram";
```

2. Logo depois de `const { intent, data } = classification;` e antes de `// ── 4. QUERY DIRETA (sem confirmação)`, inserir:

```ts
  // ── 3b. FINANCEIRO (captura e perguntas, sem confirmação) ─────────
  if (intent === "finance_capture" || intent === "finance_ask") {
    let response: string;
    let buttons: TelegramButton[][] | undefined;
    let finStatus: "executed" | "failed" = "executed";
    let finError: string | undefined;
    try {
      if (intent === "finance_capture") {
        const r = await captureText(message, source === "jarvis" ? "jarvis" : "telegram");
        response = r.summary;
        buttons = buildCaptureButtons(r);
      } else {
        response = await answerFinanceQuestion(message);
      }
    } catch (err) {
      finStatus = "failed";
      finError = String(err);
      response = "Falha no financeiro agora. Tenta de novo em instantes.";
    }
    let evIdFin: string | undefined;
    try {
      evIdFin = await persistEvent(existingEventId, {
        chatId, source, rawCommand: message, interpretedIntent: intent,
        executionStatus: finStatus, errorMessage: finError, response, userId: user.id,
      });
    } catch (saveErr) {
      console.error("[OpenClaw] finance event save failed:", saveErr);
    }
    return { response, intent, status: finStatus, eventId: evIdFin, buttons };
  }
```

3. Em `DOCUMENTAL_RESPONSE`, trocar a linha `"• Registrar pagamento\n" +` por `"• Lançar entradas e saídas, e responder sobre o financeiro\n" +`.

- [ ] **Step 8: Reescrever o webhook do Telegram**

Substituir `src/app/api/telegram/route.ts` inteiro por:

```ts
/**
 * Webhook do Telegram Bot.
 *
 * Para configurar:
 * 1. Crie um bot via @BotFather no Telegram → obtenha TELEGRAM_BOT_TOKEN
 * 2. Adicione ao .env: TELEGRAM_BOT_TOKEN=... e TELEGRAM_ALLOWED_CHAT=<seu chat_id>
 * 3. Configure o webhook:
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SUA_URL>/api/telegram"
 *
 * Responde 200 na hora e processa em after(): extrato e foto levam dezenas de
 * segundos, e o Telegram reenvia o update se o webhook demorar.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { processOpenClawMessage } from "@/lib/openclaw/engine";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { answerCallbackQuery, downloadTelegramFile, sendTelegramMessage } from "@/lib/telegram";
import { captureImage, captureText } from "@/lib/financeiro/capture/run";
import { captureStatementFile } from "@/lib/financeiro/capture/statementCapture";
import { takeCorrection } from "@/lib/financeiro/capture/apply";
import { handleFinanceCallback } from "@/lib/financeiro/capture/callbacks";
import { buildCaptureButtons, parseFinanceCallback } from "@/lib/financeiro/capture/telegramUi";
import type { ImageMime } from "@/lib/financeiro/capture/interpret";

export const maxDuration = 300;

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = process.env.TELEGRAM_ALLOWED_CHAT;
const IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

type TgPhoto = { file_id: string };
type TgDocument = { file_id: string; file_name?: string; mime_type?: string };
type TgMessage = {
  chat: { id: number | string };
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  document?: TgDocument;
};
type TgCallback = { id: string; data?: string; message?: { chat: { id: number | string } } };

const allowed = (chatId: string) => !ALLOWED_CHAT || chatId === ALLOWED_CHAT;

async function processText(chatId: string, text: string): Promise<void> {
  console.log("[telegram] received", chatId, text);

  // ── 1. Criar evento imediatamente ──────────────────────────────
  const user = await getDefaultUser();
  const initialEvent = await prisma.openClawEvent.create({
    data: {
      chatId, source: "telegram", rawCommand: text, interpretedIntent: "received",
      executionStatus: "received", response: null, errorMessage: null, userId: user.id,
    },
  });
  const eventId = initialEvent.id;

  // ── 2. Chat bloqueado ──────────────────────────────────────────
  if (!allowed(chatId)) {
    await prisma.openClawEvent.update({
      where: { id: eventId },
      data: { executionStatus: "blocked", errorMessage: "Chat não autorizado" },
    });
    return;
  }

  // ── 3. Correção de comprovante pendente ────────────────────────
  const correction = await takeCorrection();
  if (correction) {
    const r = await captureText(
      `Lançamento de um comprovante que eu tinha entendido assim: ${correction}. Correção do Fernando: ${text}`,
      "telegram",
    );
    await prisma.openClawEvent.update({
      where: { id: eventId },
      data: { interpretedIntent: "finance_capture", executionStatus: "executed", response: r.summary },
    });
    await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
    return;
  }

  // ── 4. Processar via engine ────────────────────────────────────
  let result;
  try {
    result = await processOpenClawMessage({ chatId, message: text, source: "telegram", existingEventId: eventId });
  } catch (err) {
    console.error("[POST /api/telegram] Falha no engine:", err);
    const fallbackResponse = "Sistema operacional indisponível no momento. Tente novamente em instantes.";
    await prisma.openClawEvent.update({
      where: { id: eventId },
      data: { executionStatus: "failed", errorMessage: String(err), response: fallbackResponse },
    });
    await sendTelegramMessage(chatId, fallbackResponse);
    return;
  }

  // ── 5. Se engine retornou eventId diferente (fluxo confirmação)
  if (result.eventId !== eventId) {
    try {
      await prisma.openClawEvent.update({
        where: { id: eventId },
        data: { interpretedIntent: result.intent, executionStatus: result.status, response: result.response },
      });
    } catch (updateErr) {
      console.error("[Telegram] Falha ao atualizar evento inicial:", updateErr);
    }
  }

  await sendTelegramMessage(chatId, result.response, { buttons: result.buttons });
}

async function processMedia(chatId: string, message: TgMessage): Promise<void> {
  try {
    if (message.photo?.length) {
      const best = message.photo[message.photo.length - 1];
      const file = await downloadTelegramFile(best.file_id);
      if (!file) throw new Error("download falhou");
      const r = await captureImage(file.base64, "image/jpeg", message.caption ?? null, "telegram");
      await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
      return;
    }
    const doc = message.document!;
    const mime = doc.mime_type ?? "";
    const file = await downloadTelegramFile(doc.file_id);
    if (!file) throw new Error("download falhou");
    if ((IMAGE_MIMES as string[]).includes(mime)) {
      const r = await captureImage(file.base64, mime as ImageMime, message.caption ?? null, "telegram");
      await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
      return;
    }
    await sendTelegramMessage(chatId, "⏳ Lendo o extrato…");
    const r = await captureStatementFile({ fileBase64: file.base64, fileName: doc.file_name ?? "extrato", mimeType: mime });
    await sendTelegramMessage(chatId, r.summary, { buttons: buildCaptureButtons(r) });
  } catch (err) {
    console.error("[telegram] media", err);
    await sendTelegramMessage(chatId, "Não consegui processar esse arquivo agora. Tenta de novo em instantes.");
  }
}

async function processCallback(chatId: string, data: string): Promise<void> {
  const cb = parseFinanceCallback(data);
  if (!cb) return;
  try {
    const { text, buttons } = await handleFinanceCallback(cb);
    await sendTelegramMessage(chatId, text, { buttons });
  } catch (err) {
    console.error("[telegram] callback", err);
    await sendTelegramMessage(chatId, "Falha ao executar essa ação. Tenta de novo.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const callback = update.callback_query as TgCallback | undefined;
    if (callback) {
      const chatId = String(callback.message?.chat.id ?? "");
      await answerCallbackQuery(callback.id);
      if (chatId && allowed(chatId) && callback.data) {
        after(() => processCallback(chatId, callback.data!));
      }
      return NextResponse.json({ ok: true });
    }

    const message = (update.message || update.edited_message) as TgMessage | undefined;
    if (!message) return NextResponse.json({ ok: true });
    const chatId = String(message.chat.id);

    if (message.photo?.length || message.document) {
      if (allowed(chatId)) after(() => processMedia(chatId, message));
      return NextResponse.json({ ok: true });
    }

    if (message.text) {
      const text = message.text;
      after(() => processText(chatId, text));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/telegram]", err);
    return NextResponse.json({ ok: true }); // Telegram espera 200 sempre
  }
}

export async function GET() {
  const base = {
    botConfigured: !!BOT_TOKEN,
    chatConfigured: !!ALLOWED_CHAT,
  };

  if (!BOT_TOKEN) {
    return NextResponse.json({ ...base, ok: false, error: "TELEGRAM_BOT_TOKEN não configurado" });
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const me = await meRes.json();

    const lastEvent = await prisma.openClawEvent.findFirst({
      where: { source: "telegram" },
      orderBy: { createdAt: "desc" },
      select: { rawCommand: true, createdAt: true, executionStatus: true },
    });

    return NextResponse.json({
      ...base,
      ok: me.ok,
      botUsername: me.result?.username ?? null,
      botFirstName: me.result?.first_name ?? null,
      lastEvent: lastEvent ?? null,
      error: me.ok ? undefined : me.description,
    });
  } catch {
    return NextResponse.json({ ...base, ok: false, error: "Erro ao conectar com a API do Telegram" });
  }
}
```

> Confirme em `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` que `after` é exportado de `next/server` nesta versão (é, conforme a seção "In Route Handlers").

- [ ] **Step 9: Checar tipos, lint e suíte**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros; todos PASS.

- [ ] **Step 10: Commitar**

```bash
git add src/lib/telegram.ts src/lib/financeiro/capture/telegramUi.ts src/lib/financeiro/capture/telegramUi.test.ts src/lib/financeiro/capture/callbacks.ts src/lib/openclaw/types.ts src/lib/openclaw/classifier.ts src/lib/openclaw/engine.ts src/app/api/telegram/route.ts
git commit -m "feat(telegram): finance capture by text, photo and statement with inline buttons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Cron da virada do mês

**Files:**
- Modify: `src/app/api/cron/jarvis/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `generateRecurringForMonth` (Task 4), `buildMonthlyMessage` (Task 4), `todaySaoPaulo` (Task 1).
- Produces: slot `monthly` em `/api/cron/jarvis`.

- [ ] **Step 1: Adicionar o slot**

Em `src/app/api/cron/jarvis/route.ts`:

1. Imports, adicionar:

```ts
import { prisma } from "@/lib/prisma";
import { generateRecurringForMonth } from "@/lib/financeiro/recurringRunner";
import { buildMonthlyMessage } from "@/lib/financeiro/recurring";
import { todaySaoPaulo } from "@/lib/financeiro/dates";
```

2. Trocar as duas linhas de tipo/slots por:

```ts
type Slot = "morning" | "afternoon" | "evening" | "weekly" | "monthly";
const VALID_SLOTS: Slot[] = ["morning", "afternoon", "evening", "weekly", "monthly"];
```

3. Em `frame`, adicionar a chave `monthly: "🗓️ *Virada do mês*",` no objeto `headers` (o tipo `Record<Slot, string>` exige).

4. Dentro do `try`, logo depois de `const user = await getDefaultUser();`, inserir:

```ts
    if (slot === "monthly") {
      const month = todaySaoPaulo().slice(0, 7);
      const created = await generateRecurringForMonth(user.id, month);
      const reviewCount = await prisma.financialTx.count({ where: { needsReview: true } });
      await sendTelegramMessage(chatId, buildMonthlyMessage({ month, created, reviewCount }));
      return NextResponse.json({ ok: true, slot, created: created.length });
    }
```

- [ ] **Step 2: Agendar**

Em `vercel.json`, adicionar ao array `crons` (09h BRT do dia 1 = 12h UTC):

```json
    { "path": "/api/cron/jarvis?slot=monthly", "schedule": "0 12 1 * *" }
```

(Cuidado com a vírgula na linha anterior.)

- [ ] **Step 3: Checar e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos PASS. Não chame o slot `monthly` localmente: ele grava os fixos de outubro no banco de produção. O disparo manual é na Task 15, com o Fernando.

```bash
git add src/app/api/cron/jarvis/route.ts vercel.json
git commit -m "feat(cron): monthly slot posts fixed costs and asks for statements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Ferramentas do Jarvis (repo FGT-Jarvis-Bridge)

Repositório separado: `/Users/fernandogomes/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge` (já é git). Sem framework de teste: segue o padrão de script manual (`test-client.js`).

**Files:**
- Modify: `/Users/fernandogomes/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge/server.js`
- Create: `/Users/fernandogomes/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge/test-financeiro.js`

**Interfaces:**
- Consumes: `POST /api/op/finance/capture`, `POST /api/op/finance/ask` (Task 11), `callOp` e `textResult` já existentes em `server.js`.
- Produces: ferramentas MCP `registrar_financeiro({ texto })` e `consultar_financeiro({ pergunta })`.

- [ ] **Step 1: Registrar as ferramentas**

Em `server.js`, logo depois do `server.registerTool("salvar_observacao", …)`, inserir:

```js
server.registerTool(
  "registrar_financeiro",
  {
    title: "Registrar no financeiro",
    description:
      "Registra no financeiro da FGT qualquer entrada ou saída de dinheiro, conta a pagar ou a receber, baixa de conta já lançada, " +
      "correção de categoria ou desfazer o último lançamento. Passe a fala do Fernando como ele disse, sem reescrever " +
      "(ex: 'paguei 39 mfit pix', 'boleto contadora foi pago', 'desfaz o último', 'é ferramenta'). " +
      "Se a resposta trouxer uma pergunta, leia a pergunta pra ele e mande a resposta dele de novo por esta ferramenta.",
    inputSchema: {
      texto: z.string().describe("Fala do Fernando, exatamente como ele disse"),
    },
  },
  async ({ texto }) => {
    const data = await callOp("/api/op/finance/capture", {
      method: "POST",
      body: JSON.stringify({ kind: "text", text: texto, channel: "jarvis" }),
    });
    return textResult(data.text);
  },
);

server.registerTool(
  "consultar_financeiro",
  {
    title: "Consultar o financeiro",
    description:
      "Responde perguntas sobre o financeiro da FGT: contas em aberto, o que pagar hoje ou na semana, saldo estimado por conta, " +
      "quanto entrou, saiu ou sobrou, resultado do mês, meta de faturamento e reservas, gastos por categoria, lançamentos a revisar.",
    inputSchema: {
      pergunta: z.string().describe("A pergunta do Fernando"),
    },
  },
  async ({ pergunta }) => {
    const data = await callOp("/api/op/finance/ask", {
      method: "POST",
      body: JSON.stringify({ pergunta, channel: "jarvis" }),
    });
    return textResult(data.text);
  },
);
```

Na ferramenta existente `registrar_pagamento`, trocar a `description` por:

```js
    description: "Registra um pagamento já recebido de um aluno (lançamento manual). Prefira registrar_financeiro, que entende a fala livre e dá baixa na parcela certa.",
```

- [ ] **Step 2: Script de verificação manual (só leitura)**

Criar `test-financeiro.js`:

```js
// Verificação manual das ferramentas financeiras (só leitura — não grava nada).
// Uso: OP_INTERNAL_SECRET=... node test-financeiro.js "o que temos que pagar hoje?"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pergunta = process.argv[2] ?? "quais contas estão em aberto?";
const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
  env: { OP_INTERNAL_SECRET: process.env.OP_INTERNAL_SECRET, PATH: process.env.PATH },
});
const client = new Client({ name: "test-financeiro", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log("registrar_financeiro registrada:", names.includes("registrar_financeiro"));
console.log("consultar_financeiro registrada:", names.includes("consultar_financeiro"));

const result = await client.callTool({ name: "consultar_financeiro", arguments: { pergunta } });
console.log(result.content?.[0]?.text);

await client.close();
process.exit(0);
```

- [ ] **Step 3: Commitar no repo do bridge** (rodar só depois do deploy da Task 15, porque o bridge chama produção)

```bash
cd /Users/fernandogomes/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge
git add server.js test-financeiro.js
git commit -m "feat: registrar_financeiro and consultar_financeiro MCP tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Deploy e verificação ponta a ponta com o Fernando

Esta task grava dados reais. **Cada passo que grava precisa do "pode" do Fernando no momento.**

**Files:** nenhum novo.

- [ ] **Step 1: Verificação completa local**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde. `npm run build` roda `prisma generate && next build`.

- [ ] **Step 2: Avaliação real com os arquivos do Fernando**

Pedir a ele um comprovante real (foto) e um extrato em PDF (C6 ou Nubank). Salvar como `src/lib/financeiro/__fixtures__/comprovante.jpg` e `src/lib/financeiro/__fixtures__/extrato.pdf` (pasta no `.gitignore`; confira com `git status` que não aparecem).

Run: `npm run eval:finance`
Expected: tudo PASS e nada "skipped" (10 de capture, 2 de document, 5 de ask). Confira com ele o que o teste imprimiu para o comprovante e para o PDF (valor, quantidade de linhas, 3 primeiras linhas e saldo).

Se "document" falhar ou o PDF vier com linha pulada/inventada, aplique a mesma regra das outras tarefas: troque `FINANCE_MODELS.document` para `"claude-sonnet-5-5"`, rode de novo e commite a troca explicando o motivo. Anote no fim desta task quais tarefas ficaram em Haiku e quais subiram para Sonnet.

- [ ] **Step 3: Deploy**

Perguntar ao Fernando antes ("posso subir pro ar?"). Com o ok, integrar a branch `feat/financeiro-captura` usando superpowers:finishing-a-development-branch (merge em `main` e `git push origin main`; a Vercel publica a `main`).

Esperar o deploy da Vercel terminar (`vercel ls` ou o painel) e confirmar que `https://sistema-fgt.vercel.app/api/telegram` (GET) responde `ok: true`.

- [ ] **Step 4: Jarvis lendo produção**

```bash
cd /Users/fernandogomes/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge
OP_INTERNAL_SECRET=$(grep '^OP_INTERNAL_SECRET=' .env | cut -d= -f2-) node test-financeiro.js "o que temos que pagar hoje?"
```

Expected: as duas ferramentas aparecem como `true` e vem uma resposta em português. Depois, commitar a Task 14 e reiniciar o backend do OpenJarvis para ele carregar as ferramentas novas.

- [ ] **Step 5: Roteiro ao vivo com o Fernando (Telegram)**

Pedir para ele mandar, um por vez, e conferir cada resposta:

1. `paguei 39 mfit pix` → ✅ com Ferramentas e plataformas · Pix/débito PJ, botão ↩️ Desfazer. Tocar em Desfazer → "↩️ Desfeito".
2. `vence dia 31 o CREF, 444` → "a pagar · vence 31/10".
3. `o CREF foi pago` → "✅ Baixa: CREF".
4. `quais contas estão em aberto?` → lista com valores reais.
5. Uma foto de comprovante real → proposta com ✅ Gravar / ✏️ Corrigir.
6. O extrato do C6 de setembro (OFX ou CSV) → cabeçalho "📎 Extrato C6 · setembro/2026: …" sem duplicar o que veio da InfinitePay. Conferir 3 ou 4 linhas com ele antes de tocar em ✅ Gravar todos.
7. `qual nosso saldo?` (depois do extrato) → "Saldo estimado C6: … (extrato de dd/mm …)".

E pelo Jarvis, por voz: "o que temos que pagar hoje?" e "paguei trinta e nove reais de mfit no pix" (desfazer em seguida com "desfaz o último").

- [ ] **Step 6: Fixos de outubro**

Perguntar se ele quer os fixos de outubro lançados agora (o cron só roda dia 1/11). Com o ok:

```bash
CRON=$(grep '^CRON_SECRET=' .env.local .env 2>/dev/null | head -1 | cut -d= -f2-)
curl -s "https://sistema-fgt.vercel.app/api/cron/jarvis?slot=monthly" -H "Authorization: Bearer $CRON" | jq .
```

Expected: `{ ok: true, slot: "monthly", created: 6 }` e a mensagem da virada no Telegram. Rodar de novo deve devolver `created: 0` (idempotente).

- [ ] **Step 7: Limpeza do pagamento de teste de R$1 (pendência registrada)**

Mostrar ao Fernando o que seria apagado antes de apagar:

```bash
npx prisma studio
```

Localizar em `Sale`/`Installment`/`FinancialTx`/`Client` os registros de ~15/10/2026 com valor 1,00 (o teste da InfinitePay). **Só apagar com a confirmação dele**, registro por registro, pelo Studio.

- [ ] **Step 8: Registrar o resultado**

Atualizar a memória `project_sistema_fgt_jarvis.md` (seção nova "Financeiro — Plano 1 entregue em <data>") com: o que funcionou no roteiro ao vivo, qualquer categoria/forma de pagamento que ele corrigiu no seed, e que o Plano 2 (tela + importação jan/fev) é o próximo.

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

// account = conta real onde o dinheiro cai/sai; null quando a forma não é de nenhuma conta atual.
export type NamedMethod = { name: string; account: string | null };

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

// Nomes de forma de pagamento antigos (antes do vocabulário oficial), já gravados
// em lançamentos e vendas. Decisão do Fernando: "Pix" caía no C6, "Cartão" na
// InfinitePay; "Plataforma" (Herospark) não é conta atual. Chave normalizada.
export const LEGACY_METHOD_ACCOUNTS: Readonly<Record<string, string | null>> = {
  pix: "C6",
  cartao: "InfinitePay",
  plataforma: null,
};

// Parcela de venda sem forma de pagamento: recebida pela InfinitePay (decisão do Fernando).
export const SALE_DEFAULT_ACCOUNT = "InfinitePay";

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

function isLegacyMethod(name: string): boolean {
  return Object.hasOwn(LEGACY_METHOD_ACCOUNTS, normalizeLabel(name));
}

function legacyAccount(name: string): string | null {
  return isLegacyMethod(name) ? LEGACY_METHOD_ACCOUNTS[normalizeLabel(name)] : null;
}

// Conta de uma linha de config: a gravada (se não for um nome antigo de forma),
// senão a do seed, senão a do mapa de nomes antigos. Nunca inventa conta com o
// nome da própria forma.
function rowAccount(r: ConfigRow): string | null {
  if (r.account && !isLegacyMethod(r.account)) return r.account;
  if (r.account) return legacyAccount(r.account);
  return seedAccount(r.value) ?? legacyAccount(r.value);
}

function asGroup(group: string | null, name: string): ExpenseGroup {
  if (group && (EXPENSE_GROUPS as string[]).includes(group)) return group as ExpenseGroup;
  return seedGroup(name) ?? "despesa";
}

export function buildVocab(rows: ConfigRow[]): Vocab {
  const active = rows.filter((r) => r.active).sort((a, b) => a.order - b.order);
  const of = (t: ConfigType) => active.filter((r) => r.type === t);
  const method = (r: ConfigRow): NamedMethod => ({ name: r.value, account: rowAccount(r) });
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
  const known = [...vocab.payMethods, ...vocab.recvMethods].find((m) => normalizeLabel(m.name) === n);
  return known ? known.account : legacyAccount(method);
}

export function groupOfCategory(vocab: Vocab, category: string): ExpenseGroup | null {
  const n = normalizeLabel(category);
  return vocab.expenseCategories.find((c) => normalizeLabel(c.name) === n)?.group ?? null;
}

// Só contas reais: formas sem conta (ou nomes antigos sem conta atual) ficam de fora.
export function accountsOf(vocab: Vocab): string[] {
  return [...new Set(
    [...vocab.payMethods, ...vocab.recvMethods].map((m) => m.account).filter((a): a is string => !!a),
  )];
}

export function methodsForAccount(vocab: Vocab, account: string): string[] {
  return [...vocab.payMethods, ...vocab.recvMethods].filter((m) => m.account === account).map((m) => m.name);
}

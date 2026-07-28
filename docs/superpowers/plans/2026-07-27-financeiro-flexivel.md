# Financeiro Flexível — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que uma venda seja composta por várias linhas de recebimento independentes, cada uma com sua própria forma de pagamento, datas e tratamento de taxa.

**Architecture:** Toda a lógica de negócio (regras de data, cálculo de líquido, atalhos de negociação, conversão para API) vive num módulo puro e testado em `src/lib/financeiro/receivables.ts`. A UI (formulário de venda e financeiro) apenas consome esse módulo. O schema muda em um único campo (`Installment.cashDate`). O mapeamento venda→lançamentos do financeiro é extraído do arquivo monolítico para um módulo puro antes de ter seu comportamento alterado.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7 + PostgreSQL (Neon), React 19, Tailwind 4, Vitest (novo).

**Spec:** `docs/superpowers/specs/2026-07-27-financeiro-flexivel-design.md`

## Global Constraints

- **Next.js 16 tem breaking changes.** Conforme `AGENTS.md`: consultar `node_modules/next/dist/docs/` antes de escrever código que dependa de APIs do Next. Não assumir convenções de versões anteriores.
- **Prisma: usar `db push`, não `migrate dev`.** O schema já divergiu das migrations (modelos como `StudentJourney`, `InvoiceIssue`, `FinancialConfig` e `FinancialMonthClose` existem em `schema.prisma` sem migration correspondente; a última migration é `20260513200000`). Rodar `migrate dev` geraria uma migration gigante e arriscada.
- **Após `prisma generate`, reiniciar o servidor de dev.** Hot reload não recarrega o Prisma em memória neste projeto.
- **Nenhuma venda existente pode quebrar ou sumir.** Toda alteração preserva os dados atuais.
- **Idioma:** identificadores de código em inglês; textos de interface em português (padrão já adotado no projeto).
- **Formato de data nos rascunhos de UI:** string `YYYY-MM-DD`. Datas são instanciadas com sufixo `T12:00` para evitar erro de fuso (padrão já usado em `vendas/route.ts:64`).
- **Commits frequentes**, um por task concluída.

---

### Task 1: Infraestrutura de testes (Vitest)

O projeto não possui nenhum runner de testes hoje. As regras de negócio deste plano (datas, taxas, atalhos) são lógica pura e precisam de testes.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/lib/financeiro/smoke.test.ts` (removido na Task 2)

**Interfaces:**
- Consumes: nada
- Produces: comando `npm test` funcionando, para todas as tasks seguintes

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Adicionar o script de teste ao `package.json`**

Em `"scripts"`, adicionar:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Criar um teste de fumaça**

Criar `src/lib/financeiro/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("infraestrutura de testes", () => {
  it("executa testes", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS — 1 teste

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/financeiro/smoke.test.ts
git commit -m "test: add vitest test runner"
```

---

### Task 2: Módulo de recebimentos (lógica pura)

Coração da funcionalidade. Tudo aqui é função pura e testável, sem React e sem Prisma.

**Files:**
- Create: `src/lib/financeiro/receivables.ts`
- Create: `src/lib/financeiro/receivables.test.ts`
- Delete: `src/lib/financeiro/smoke.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `type FeeOwner = "aluno" | "empresa"`
  - `type ReceivableLine` (campos: `id`, `amount`, `paymentMethod`, `dueDate`, `cashDate`, `feeOwner`, `feeValue`, `paid`, `label` — todos `string` exceto `paid: boolean` e `feeOwner`)
  - `type PresetId = "card_full" | "pix_full" | "entry_pix_installments" | "entry_then_card" | "entry_then_pix"`
  - `RECEIVABLE_METHODS: readonly string[]`
  - `nextBusinessDay(iso: string): string`
  - `defaultCashDate(dueDate: string, paymentMethod: string): string`
  - `netValueOf(line: ReceivableLine): number`
  - `grossOf(line: ReceivableLine): number`
  - `sumTotals(lines: ReceivableLine[]): { faturamento: number; caixa: number }`
  - `buildPreset(preset: PresetId, opts: { total: number; startDate: string; entryAmount?: number; parcelas?: number }): ReceivableLine[]`
  - `emptyLine(startDate: string): ReceivableLine`
  - `toApiInstallments(lines: ReceivableLine[]): ApiInstallment[]`
  - `type ApiInstallment` (campos: `amount: number`, `dueDate: string`, `cashDate: string`, `paymentMethod: string`, `netValue: number`, `label: string`, `paid: boolean`)

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/financeiro/receivables.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  nextBusinessDay,
  defaultCashDate,
  netValueOf,
  sumTotals,
  buildPreset,
  emptyLine,
  toApiInstallments,
  type ReceivableLine,
} from "./receivables";

function line(over: Partial<ReceivableLine> = {}): ReceivableLine {
  return {
    id: "1",
    amount: "100",
    paymentMethod: "Pix",
    dueDate: "2026-07-27",
    cashDate: "2026-07-27",
    feeOwner: "aluno",
    feeValue: "",
    paid: false,
    label: "Pagamento",
    ...over,
  };
}

describe("nextBusinessDay", () => {
  it("avanca um dia em dia util", () => {
    // 2026-07-27 é segunda-feira
    expect(nextBusinessDay("2026-07-27")).toBe("2026-07-28");
  });

  it("pula sabado e domingo quando cai na sexta", () => {
    // 2026-07-31 é sexta-feira -> proximo util é segunda 2026-08-03
    expect(nextBusinessDay("2026-07-31")).toBe("2026-08-03");
  });

  it("pula domingo quando cai no sabado", () => {
    // 2026-08-01 é sabado -> proximo util é segunda 2026-08-03
    expect(nextBusinessDay("2026-08-01")).toBe("2026-08-03");
  });
});

describe("defaultCashDate", () => {
  it("Pix cai no mesmo dia", () => {
    expect(defaultCashDate("2026-07-27", "Pix")).toBe("2026-07-27");
  });

  it("Cartao cai em um dia util", () => {
    expect(defaultCashDate("2026-07-27", "Cartão")).toBe("2026-07-28");
  });

  it("Cartao numa sexta cai na segunda", () => {
    expect(defaultCashDate("2026-07-31", "Cartão")).toBe("2026-08-03");
  });

  it("demais formas caem no mesmo dia", () => {
    expect(defaultCashDate("2026-07-27", "Dinheiro")).toBe("2026-07-27");
  });
});

describe("netValueOf", () => {
  it("taxa do aluno: liquido igual ao bruto", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "aluno", feeValue: "70" }))).toBe(1500);
  });

  it("taxa da empresa: liquido desconta a taxa", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "empresa", feeValue: "70" }))).toBe(1430);
  });

  it("taxa da empresa sem valor informado: liquido igual ao bruto", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "empresa", feeValue: "" }))).toBe(1500);
  });

  it("aceita valor com virgula decimal", () => {
    expect(netValueOf(line({ amount: "1500,50", feeOwner: "aluno" }))).toBe(1500.5);
  });
});

describe("sumTotals", () => {
  it("faturamento soma o bruto e caixa soma o liquido", () => {
    const lines = [
      line({ id: "a", amount: "1000", feeOwner: "aluno" }),
      line({ id: "b", amount: "500", feeOwner: "empresa", feeValue: "50" }),
    ];
    expect(sumTotals(lines)).toEqual({ faturamento: 1500, caixa: 1450 });
  });

  it("ignora linhas sem valor", () => {
    const lines = [line({ id: "a", amount: "1000" }), line({ id: "b", amount: "" })];
    expect(sumTotals(lines)).toEqual({ faturamento: 1000, caixa: 1000 });
  });
});

describe("buildPreset", () => {
  it("card_full gera uma linha de cartao com caixa em um dia util", () => {
    const lines = buildPreset("card_full", { total: 2000, startDate: "2026-07-27" });
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe("2000");
    expect(lines[0].paymentMethod).toBe("Cartão");
    expect(lines[0].dueDate).toBe("2026-07-27");
    expect(lines[0].cashDate).toBe("2026-07-28");
  });

  it("pix_full gera uma linha de pix com caixa no mesmo dia", () => {
    const lines = buildPreset("pix_full", { total: 2000, startDate: "2026-07-27" });
    expect(lines).toHaveLength(1);
    expect(lines[0].paymentMethod).toBe("Pix");
    expect(lines[0].cashDate).toBe("2026-07-27");
  });

  it("entry_pix_installments gera entrada mais parcelas mensais", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 1000, startDate: "2026-07-27", entryAmount: 400, parcelas: 3,
    });
    expect(lines).toHaveLength(4);
    expect(lines[0].amount).toBe("400");
    expect(lines[0].label).toBe("Entrada");
    expect(lines[1].amount).toBe("200");
    expect(lines[1].dueDate).toBe("2026-08-27");
    expect(lines[2].dueDate).toBe("2026-09-27");
    expect(lines[3].dueDate).toBe("2026-10-27");
    expect(lines.every(l => l.paymentMethod === "Pix")).toBe(true);
  });

  it("entry_then_card gera entrada mais uma linha de cartao no mes seguinte", () => {
    const lines = buildPreset("entry_then_card", {
      total: 1000, startDate: "2026-07-27", entryAmount: 300,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe("300");
    expect(lines[1].amount).toBe("700");
    expect(lines[1].paymentMethod).toBe("Cartão");
    expect(lines[1].dueDate).toBe("2026-08-27");
    expect(lines[1].cashDate).toBe("2026-08-28");
  });

  it("entry_then_pix gera entrada mais uma linha de pix no mes seguinte", () => {
    const lines = buildPreset("entry_then_pix", {
      total: 1000, startDate: "2026-07-27", entryAmount: 300,
    });
    expect(lines).toHaveLength(2);
    expect(lines[1].paymentMethod).toBe("Pix");
    expect(lines[1].amount).toBe("700");
    expect(lines[1].cashDate).toBe("2026-08-27");
  });

  it("distribui sobra de centavos na primeira parcela", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 1000, startDate: "2026-07-27", entryAmount: 0.01, parcelas: 3,
    });
    const soma = lines.reduce((s, l) => s + Number(l.amount), 0);
    expect(soma).toBeCloseTo(1000, 2);
  });

  it("gera ids unicos por linha", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 900, startDate: "2026-07-27", entryAmount: 300, parcelas: 2,
    });
    const ids = new Set(lines.map(l => l.id));
    expect(ids.size).toBe(lines.length);
  });
});

describe("emptyLine", () => {
  it("cria uma linha vazia com padroes seguros", () => {
    const l = emptyLine("2026-07-27");
    expect(l.amount).toBe("");
    expect(l.dueDate).toBe("2026-07-27");
    expect(l.paid).toBe(false);
    expect(l.feeOwner).toBe("aluno");
  });
});

describe("toApiInstallments", () => {
  it("converte linhas em payload da API", () => {
    const lines = [
      line({ id: "a", amount: "1500", feeOwner: "empresa", feeValue: "70",
             paymentMethod: "Cartão", dueDate: "2026-07-27", cashDate: "2026-07-28",
             label: "Entrada", paid: true }),
    ];
    expect(toApiInstallments(lines)).toEqual([
      { amount: 1500, netValue: 1430, paymentMethod: "Cartão",
        dueDate: "2026-07-27", cashDate: "2026-07-28", label: "Entrada", paid: true },
    ]);
  });

  it("descarta linhas com valor zero ou vazio", () => {
    const lines = [line({ id: "a", amount: "100" }), line({ id: "b", amount: "" }),
                   line({ id: "c", amount: "0" })];
    expect(toApiInstallments(lines)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — não consegue resolver o módulo `./receivables`

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/financeiro/receivables.ts`:

```ts
// Modelo de recebimentos por linha.
// Uma venda é uma lista de linhas independentes; cada linha tem sua própria
// forma de pagamento, datas e tratamento de taxa.

export type FeeOwner = "aluno" | "empresa";

export type ReceivableLine = {
  id: string;            // uso interno da UI (key do React)
  amount: string;        // valor bruto, string por ser input controlado
  paymentMethod: string;
  dueDate: string;       // YYYY-MM-DD — data combinada com o aluno
  cashDate: string;      // YYYY-MM-DD — data de entrada real no caixa
  feeOwner: FeeOwner;    // quem absorve a taxa do cartão
  feeValue: string;      // valor da taxa quando feeOwner === "empresa"
  paid: boolean;
  label: string;
};

export type ApiInstallment = {
  amount: number;
  netValue: number;
  paymentMethod: string;
  dueDate: string;
  cashDate: string;
  label: string;
  paid: boolean;
};

export type PresetId =
  | "card_full"
  | "pix_full"
  | "entry_pix_installments"
  | "entry_then_card"
  | "entry_then_pix";

export const RECEIVABLE_METHODS = [
  "Pix", "Cartão", "InfinitePay", "Dinheiro", "Transferência", "Boleto", "Outro",
] as const;

function toNumber(v: string): number {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `line_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Próximo dia útil após a data informada (pula sábado e domingo). */
export function nextBusinessDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo
  if (d.getDay() === 6) d.setDate(d.getDate() + 2); // sábado
  return d.toISOString().slice(0, 10);
}

/** Mesma data, N meses à frente. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Data padrão de entrada no caixa conforme a forma de pagamento.
 * Pix cai na hora; cartão cai em um dia útil. Sempre editável pela UI.
 */
export function defaultCashDate(dueDate: string, paymentMethod: string): string {
  return paymentMethod === "Cartão" ? nextBusinessDay(dueDate) : dueDate;
}

export function grossOf(line: ReceivableLine): number {
  return round2(toNumber(line.amount));
}

/**
 * Valor líquido da linha. Taxa do aluno => recebe o bruto.
 * Taxa da empresa => desconta a taxa informada.
 */
export function netValueOf(line: ReceivableLine): number {
  const gross = grossOf(line);
  if (line.feeOwner !== "empresa") return gross;
  const fee = toNumber(line.feeValue);
  return round2(gross - fee);
}

export function sumTotals(lines: ReceivableLine[]): { faturamento: number; caixa: number } {
  return lines.reduce(
    (acc, l) => ({
      faturamento: round2(acc.faturamento + grossOf(l)),
      caixa:       round2(acc.caixa + netValueOf(l)),
    }),
    { faturamento: 0, caixa: 0 },
  );
}

export function emptyLine(startDate: string): ReceivableLine {
  return {
    id: newId(),
    amount: "",
    paymentMethod: "Pix",
    dueDate: startDate,
    cashDate: startDate,
    feeOwner: "aluno",
    feeValue: "",
    paid: false,
    label: "",
  };
}

function makeLine(over: Partial<ReceivableLine> & { dueDate: string; paymentMethod: string }): ReceivableLine {
  return {
    id: newId(),
    amount: "",
    feeOwner: "aluno",
    feeValue: "",
    paid: false,
    label: "",
    cashDate: defaultCashDate(over.dueDate, over.paymentMethod),
    ...over,
  };
}

/**
 * Monta as linhas de um formato de negociação já praticado pela FGT.
 * É ponto de partida: todas as linhas continuam editáveis depois.
 */
export function buildPreset(
  preset: PresetId,
  opts: { total: number; startDate: string; entryAmount?: number; parcelas?: number },
): ReceivableLine[] {
  const { total, startDate } = opts;
  const entry = opts.entryAmount ?? 0;

  if (preset === "card_full") {
    return [makeLine({ dueDate: startDate, paymentMethod: "Cartão",
                       amount: String(round2(total)), label: "Pagamento" })];
  }

  if (preset === "pix_full") {
    return [makeLine({ dueDate: startDate, paymentMethod: "Pix",
                       amount: String(round2(total)), label: "Pagamento" })];
  }

  if (preset === "entry_then_card" || preset === "entry_then_pix") {
    const method = preset === "entry_then_card" ? "Cartão" : "Pix";
    return [
      makeLine({ dueDate: startDate, paymentMethod: "Pix",
                 amount: String(round2(entry)), label: "Entrada" }),
      makeLine({ dueDate: addMonths(startDate, 1), paymentMethod: method,
                 amount: String(round2(total - entry)), label: "Restante" }),
    ];
  }

  // entry_pix_installments
  const parcelas = opts.parcelas ?? 2;
  const restante = round2(total - entry);
  const base = round2(restante / parcelas);
  const lines: ReceivableLine[] = [
    makeLine({ dueDate: startDate, paymentMethod: "Pix",
               amount: String(round2(entry)), label: "Entrada" }),
  ];
  for (let i = 0; i < parcelas; i++) {
    // A sobra de centavos vai na primeira parcela para o total fechar.
    const valor = i === 0 ? round2(restante - base * (parcelas - 1)) : base;
    lines.push(makeLine({
      dueDate: addMonths(startDate, i + 1),
      paymentMethod: "Pix",
      amount: String(valor),
      label: `${i + 1}ª parcela`,
    }));
  }
  return lines;
}

/** Converte as linhas da UI no payload aceito por POST /api/financeiro/vendas. */
export function toApiInstallments(lines: ReceivableLine[]): ApiInstallment[] {
  return lines
    .filter(l => grossOf(l) > 0)
    .map(l => ({
      amount:        grossOf(l),
      netValue:      netValueOf(l),
      paymentMethod: l.paymentMethod,
      dueDate:       l.dueDate,
      cashDate:      l.cashDate,
      label:         l.label,
      paid:          l.paid,
    }));
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — todos os testes de `receivables.test.ts`

- [ ] **Step 5: Remover o teste de fumaça**

```bash
rm src/lib/financeiro/smoke.test.ts
```

- [ ] **Step 6: Rodar os testes novamente**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/financeiro/receivables.ts src/lib/financeiro/receivables.test.ts
git rm --cached src/lib/financeiro/smoke.test.ts 2>/dev/null || true
git add -A src/lib/financeiro
git commit -m "feat(finance): add per-line receivables domain module"
```

---

### Task 3: Campo `cashDate` no banco e na API

**Files:**
- Modify: `prisma/schema.prisma` (model `Installment`, linhas 276-291)
- Modify: `src/app/api/financeiro/vendas/route.ts:28-100`

**Interfaces:**
- Consumes: `ApiInstallment` da Task 2
- Produces: `POST /api/financeiro/vendas` aceitando, dentro de `customInstallments`, os campos `paymentMethod`, `netValue` e `cashDate` por linha; `Installment.cashDate` persistido no banco

- [ ] **Step 1: Adicionar o campo ao schema**

Em `prisma/schema.prisma`, no model `Installment`, adicionar após a linha do campo `dueDate`:

```prisma
  cashDate      DateTime? // data de entrada real no caixa (default derivado da forma de pagamento)
```

- [ ] **Step 2: Aplicar no banco e regenerar o client**

```bash
npx prisma db push
npx prisma generate
```

Expected: `db push` reporta a coluna adicionada; `generate` conclui sem erro.

Se o dev server estiver rodando, **reiniciá-lo agora** (o Prisma em memória não recarrega sozinho).

- [ ] **Step 3: Aceitar os novos campos na API**

Em `src/app/api/financeiro/vendas/route.ts`, substituir o bloco de montagem de `installmentData` (atualmente linhas 46-71) por:

```ts
    type InstData = {
      number: number; amount: number; netValue?: number;
      dueDate: Date; cashDate?: Date; status: string; paidAt?: Date;
      label?: string; paymentMethod?: string;
    };
    let installmentData: InstData[] = [];

    if (Array.isArray(customInstallments) && customInstallments.length > 0) {
      installmentData = customInstallments.map((inst: {
        amount: string | number; dueDate: string; cashDate?: string;
        netValue?: string | number; label?: string; paid?: boolean; paymentMethod?: string;
      }, i: number) => {
        const instPaid = isPaid || inst.paid === true;
        const entry: InstData = {
          number:  i + 1,
          amount:  parseFloat(String(inst.amount)),
          dueDate: new Date(String(inst.dueDate) + "T12:00"),
          status:  instPaid ? "pago" : "pendente",
          label:   inst.label || undefined,
        };
        if (inst.cashDate)      entry.cashDate      = new Date(String(inst.cashDate) + "T12:00");
        if (inst.netValue)      entry.netValue      = parseFloat(String(inst.netValue));
        if (inst.paymentMethod) entry.paymentMethod = inst.paymentMethod;
        if (instPaid)           entry.paidAt        = new Date();
        return entry;
      });
    }
```

Nota: `paymentMethod` deixa de precisar do cast `as Record<string, unknown>` porque agora está declarado em `InstData`.

- [ ] **Step 4: Verificar a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros em `vendas/route.ts`

- [ ] **Step 5: Testar a API manualmente**

Com `npm run dev` rodando, criar uma venda mista via terminal (substituir `<CLIENT_ID>` por um id real de aluno):

```bash
curl -s -X POST http://localhost:3000/api/financeiro/vendas \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<CLIENT_ID>","description":"Teste misto","totalAmount":1000,
       "customInstallments":[
         {"amount":400,"dueDate":"2026-07-27","cashDate":"2026-07-27","paymentMethod":"Pix","netValue":400,"label":"Entrada"},
         {"amount":600,"dueDate":"2026-08-27","cashDate":"2026-08-28","paymentMethod":"Cartão","netValue":570,"label":"Restante"}
       ]}' | head -40
```

Expected: JSON da venda com duas parcelas, cada uma com `paymentMethod`, `netValue` e `cashDate` distintos.

- [ ] **Step 6: Remover a venda de teste**

```bash
curl -s -X DELETE http://localhost:3000/api/financeiro/vendas/<SALE_ID_RETORNADO>
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/app/api/financeiro/vendas/route.ts
git commit -m "feat(finance): persist per-installment cash date and payment method"
```

---

### Task 4: Componente da tabela de recebimentos

**Files:**
- Create: `src/components/financeiro/ReceivablesTable.tsx`

**Interfaces:**
- Consumes: `ReceivableLine`, `RECEIVABLE_METHODS`, `defaultCashDate`, `emptyLine`, `sumTotals`, `netValueOf` (Task 2)
- Produces: componente `<ReceivablesTable lines onChange startDate />`, onde `onChange: (lines: ReceivableLine[]) => void`

- [ ] **Step 1: Criar o componente**

Criar `src/components/financeiro/ReceivablesTable.tsx`:

```tsx
"use client";

import {
  RECEIVABLE_METHODS, defaultCashDate, emptyLine, sumTotals, netValueOf,
  type ReceivableLine,
} from "@/lib/financeiro/receivables";

const cell = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function ReceivablesTable({ lines, onChange, startDate }: {
  lines: ReceivableLine[];
  onChange: (lines: ReceivableLine[]) => void;
  startDate: string;
}) {
  // Alterar valor/forma de pagamento recalcula a data de caixa,
  // a menos que o usuário já tenha ajustado a data manualmente.
  function update(idx: number, patch: Partial<ReceivableLine>) {
    onChange(lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      if (patch.paymentMethod !== undefined || patch.dueDate !== undefined) {
        const eraAutomatica = l.cashDate === defaultCashDate(l.dueDate, l.paymentMethod);
        if (eraAutomatica) next.cashDate = defaultCashDate(next.dueDate, next.paymentMethod);
      }
      return next;
    }));
  }

  function addLine() { onChange([...lines, emptyLine(startDate)]); }
  function removeLine(idx: number) { onChange(lines.filter((_, i) => i !== idx)); }

  const totals = sumTotals(lines);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((l, idx) => (
          <div key={l.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/60">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-gray-500">
                Valor
                <input type="text" inputMode="decimal" value={l.amount} placeholder="0,00"
                  onChange={e => update(idx, { amount: e.target.value })}
                  className={`${cell} w-full mt-0.5`} />
              </label>
              <label className="text-[11px] text-gray-500">
                Forma de pagamento
                <select value={l.paymentMethod}
                  onChange={e => update(idx, { paymentMethod: e.target.value })}
                  className={`${cell} w-full mt-0.5`}>
                  {RECEIVABLE_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-gray-500">
                Vencimento
                <input type="date" value={l.dueDate}
                  onChange={e => update(idx, { dueDate: e.target.value })}
                  className={`${cell} w-full mt-0.5`} />
              </label>
              <label className="text-[11px] text-gray-500">
                Entra no caixa
                <input type="date" value={l.cashDate}
                  onChange={e => update(idx, { cashDate: e.target.value })}
                  className={`${cell} w-full mt-0.5`} />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input type="text" value={l.label} placeholder="Rótulo (ex: Entrada)"
                onChange={e => update(idx, { label: e.target.value })}
                className={`${cell} flex-1 min-w-[120px]`} />

              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button type="button" onClick={() => update(idx, { feeOwner: "aluno" })}
                  className={`px-2 py-1.5 text-xs ${l.feeOwner === "aluno" ? "bg-indigo-500 text-white" : "bg-white text-gray-600"}`}>
                  Taxa do aluno
                </button>
                <button type="button" onClick={() => update(idx, { feeOwner: "empresa" })}
                  className={`px-2 py-1.5 text-xs ${l.feeOwner === "empresa" ? "bg-indigo-500 text-white" : "bg-white text-gray-600"}`}>
                  Taxa minha
                </button>
              </div>

              {l.feeOwner === "empresa" && (
                <input type="text" inputMode="decimal" value={l.feeValue} placeholder="Taxa R$"
                  onChange={e => update(idx, { feeValue: e.target.value })}
                  className={`${cell} w-24`} />
              )}

              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={l.paid}
                  onChange={e => update(idx, { paid: e.target.checked })} />
                Pago
              </label>

              <button type="button" onClick={() => removeLine(idx)}
                className="ml-auto text-xs text-red-500 hover:underline">
                Remover
              </button>
            </div>

            {l.feeOwner === "empresa" && (
              <p className="text-[11px] text-gray-500">Líquido: {fmt(netValueOf(l))}</p>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addLine}
        className="text-sm text-indigo-600 hover:underline">
        + Adicionar recebimento
      </button>

      <div className="flex gap-4 text-sm border-t border-gray-200 pt-2">
        <span className="text-gray-500">Faturamento: <strong className="text-gray-800">{fmt(totals.faturamento)}</strong></span>
        <span className="text-gray-500">Caixa: <strong className="text-gray-800">{fmt(totals.caixa)}</strong></span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/components/financeiro/ReceivablesTable.tsx
git commit -m "feat(finance): add receivables table component"
```

---

### Task 5: Substituir o formulário de venda no cadastro do aluno

Remove a ramificação `if (negType === "card")` — a causa raiz do engessamento.

**Files:**
- Modify: `src/app/(dashboard)/alunos/page.tsx` — componente `AlunoPaymentForm` (linhas 123-650 aprox.)

**Interfaces:**
- Consumes: `ReceivablesTable` (Task 4); `buildPreset`, `toApiInstallments`, `sumTotals`, `emptyLine`, `type PresetId` (Task 2)
- Produces: formulário que envia `customInstallments` com forma de pagamento, `cashDate` e `netValue` por linha

- [ ] **Step 1: Substituir o estado de pagamento do formulário**

Em `AlunoPaymentForm`, remover os estados `negType`, `installments`, `grossValue`, `cashFlowDate` e `cardInstallments` (linhas 139-157 aprox.) e colocar no lugar:

```tsx
  const [lines, setLines] = useState<ReceivableLine[]>(() => [emptyLine(today)]);
  const [presetTotal, setPresetTotal] = useState("");
  const [presetEntry, setPresetEntry] = useState("");
  const [presetParcelas, setPresetParcelas] = useState(2);
```

Adicionar os imports no topo do arquivo:

```tsx
import { ReceivablesTable } from "@/components/financeiro/ReceivablesTable";
import {
  buildPreset, toApiInstallments, sumTotals, emptyLine,
  type ReceivableLine, type PresetId,
} from "@/lib/financeiro/receivables";
```

- [ ] **Step 2: Trocar `handleSave` pela versão sem ramificação**

Substituir a função `handleSave` (atualmente linhas 282-323) por:

```tsx
  async function handleSave() {
    const descricao = plan?.name || customPlanName || "Plano";
    const parcelas  = toApiInstallments(lines);
    if (parcelas.length === 0) return;

    const totals = sumTotals(lines);
    const body: Record<string, unknown> = {
      clientId:           aluno.id,
      description:        descricao,
      negotiationNotes:   negotiationNotes || null,
      servicePlanId:      selectedPlanId || null,
      totalAmount:        totals.faturamento,
      grossValue:         totals.faturamento,
      netValue:           totals.caixa,
      customInstallments: parcelas,
      // Rótulo descritivo apenas; não controla mais a lógica de exibição.
      negotiationType:    parcelas.length === 1 ? "cash" : "custom",
      paymentMethod:      parcelas[0].paymentMethod,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/financeiro/vendas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const sale = await res.json();
      if (sale.id) onSaved(sale);
      else alert("Erro ao salvar: " + (sale.error || "tente novamente"));
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 3: Remover as funções agora órfãs**

Remover de `AlunoPaymentForm`: `addInstallment`, `removeInstallment`, `updateInstallment`, `getResumo`, e as constantes `totalInstallments` / `totalCard` (linhas 265-336 aprox.). A `ReceivablesTable` cobre todas essas responsabilidades.

Remover também a função `nextBusinessDay` do topo do arquivo (linha 106) — passa a viver em `receivables.ts`. Se outro trecho do arquivo a usar, importar do módulo novo.

- [ ] **Step 4: Substituir o bloco de UI da negociação pelos atalhos + tabela**

Substituir o bloco que renderiza `NEG_TYPES` (linha 383 aprox.) e todo o editor de parcelas antigo por:

```tsx
      <div>
        <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Como vai receber</p>

        <div className="flex flex-wrap gap-2 items-end mb-3">
          <label className="text-[11px] text-gray-500">
            Valor total
            <input type="text" inputMode="decimal" value={presetTotal} placeholder="0,00"
              onChange={e => setPresetTotal(e.target.value)}
              className={`${inputSmCls} w-28 block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-500">
            Entrada
            <input type="text" inputMode="decimal" value={presetEntry} placeholder="0,00"
              onChange={e => setPresetEntry(e.target.value)}
              className={`${inputSmCls} w-28 block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-500">
            Parcelas
            <select value={presetParcelas} onChange={e => setPresetParcelas(Number(e.target.value))}
              className={`${inputSmCls} w-20 block mt-0.5`}>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {([
            ["card_full",             "Total no cartão"],
            ["pix_full",              "Pix à vista"],
            ["entry_pix_installments","Entrada + parcelas Pix"],
            ["entry_then_card",       "Entrada + cartão depois"],
            ["entry_then_pix",        "Entrada + Pix depois"],
          ] as [PresetId, string][]).map(([id, label]) => (
            <button key={id} type="button"
              onClick={() => setLines(buildPreset(id, {
                total:       parseFloat(presetTotal.replace(",", ".")) || 0,
                startDate:   today,
                entryAmount: parseFloat(presetEntry.replace(",", ".")) || 0,
                parcelas:    presetParcelas,
              }))}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:border-indigo-400 hover:text-indigo-600 bg-white">
              {label}
            </button>
          ))}
        </div>

        <ReceivablesTable lines={lines} onChange={setLines} startDate={today} />
      </div>
```

- [ ] **Step 5: Ajustar a análise por IA para preencher linhas**

Em `handleAnalyzeIA` (linhas 234-263 aprox.), substituir o bloco que popula `installments` por:

```tsx
      if (data.customInstallments?.length) {
        setLines(data.customInstallments.map((i: {
          amount: number; dueDate: string; label?: string; paymentMethod?: string;
        }, idx: number) => {
          const base = emptyLine(i.dueDate);
          const method = i.paymentMethod || data.paymentMethod || "Pix";
          return {
            ...base,
            amount:        String(i.amount),
            dueDate:       i.dueDate,
            cashDate:      defaultCashDate(i.dueDate, method),
            paymentMethod: method,
            label:         i.label || `${idx + 1}ª parcela`,
          };
        }));
        if (data.summary) setAiSummary(data.summary);
      }
```

Adicionar `defaultCashDate` à lista de imports de `receivables`.

- [ ] **Step 6: Verificar a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros. Se houver erro de `NEG_TYPES` não usado no formulário, manter a constante (ela ainda é usada na exibição da venda, linha 1458) e remover apenas o uso dentro do formulário.

- [ ] **Step 7: Verificar no navegador**

Com `npm run dev` rodando, abrir `http://localhost:3000/alunos`, abrir um aluno e o formulário de pagamento. Confirmar:
- Os 5 atalhos aparecem e montam as linhas
- Adicionar/remover linha funciona
- Trocar a forma para "Cartão" move a data de caixa para o próximo dia útil
- "Taxa minha" revela o campo de taxa e mostra o líquido
- O rodapé mostra Faturamento e Caixa

Salvar uma venda com **entrada no Pix + restante no cartão** e confirmar que ela aparece no aluno.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/alunos/page.tsx
git commit -m "feat(finance): replace rigid sale form with per-line receivables"
```

---

### Task 6: Extrair o mapeamento venda→lançamentos (refatoração sem mudança de comportamento)

O trecho que decide como uma venda vira lançamento vive dentro do arquivo de 1.683 linhas. Extrair **antes** de alterar, para que a mudança de comportamento da Task 7 seja revisável isoladamente.

**Files:**
- Create: `src/lib/financeiro/saleTxs.ts`
- Create: `src/lib/financeiro/saleTxs.test.ts`
- Modify: `src/app/(dashboard)/financeiro/page.tsx:1470-1496`

**Interfaces:**
- Consumes: nada da Task 2 (mapeamento é independente)
- Produces:
  - `type SaleTx` — objeto com `id`, `type`, `description`, `amount`, `category`, `status`, `dueDate`, `paidAt`, `paymentMethod`, `notes`, `client`, `_saleId`, `_installmentId?`
  - `type SaleInput` / `type InstallmentInput` — formatos de entrada
  - `buildSaleTxs(sales: SaleInput[], existingInstallmentIds: Set<string>): SaleTx[]`

- [ ] **Step 1: Escrever os testes que fixam o comportamento atual**

Criar `src/lib/financeiro/saleTxs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSaleTxs, type SaleInput } from "./saleTxs";

const client = { id: "c1", name: "João" };

function sale(over: Partial<SaleInput> = {}): SaleInput {
  return {
    id: "s1",
    description: "Consultoria",
    negotiationType: "pix",
    grossValue: null,
    paymentMethod: "Pix",
    installmentsCount: 1,
    createdAt: "2026-07-27T00:00:00.000Z",
    client,
    installments: [],
    ...over,
  };
}

describe("buildSaleTxs — comportamento atual", () => {
  it("venda no Pix gera um lancamento por parcela pelo valor bruto", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          paidAt: null, status: "pendente", label: null, paymentMethod: "Pix", cashDate: null },
      ],
    })], new Set());

    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(500);
    expect(txs[0]._installmentId).toBe("i1");
  });

  it("venda no cartao gera lancamento de faturamento mais o de caixa pelo liquido", () => {
    const txs = buildSaleTxs([sale({
      negotiationType: "card",
      grossValue: 1000,
      installments: [
        { id: "i1", number: 1, amount: 1000, netValue: 950, dueDate: "2026-07-28",
          paidAt: null, status: "pendente", label: null, paymentMethod: "Cartão", cashDate: null },
      ],
    })], new Set());

    expect(txs).toHaveLength(2);
    expect(txs[0].category).toBe("Faturamento");
    expect(txs[0].amount).toBe(1000);
    expect(txs[1].category).toBe("Caixa");
    expect(txs[1].amount).toBe(950);
  });

  it("ignora parcelas ja lancadas manualmente", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          paidAt: null, status: "pendente", label: null, paymentMethod: "Pix", cashDate: null },
      ],
    })], new Set(["i1"]));

    expect(txs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test`
Expected: FAIL — módulo `./saleTxs` não existe

- [ ] **Step 3: Criar o módulo copiando a lógica atual**

Criar `src/lib/financeiro/saleTxs.ts` transcrevendo fielmente a lógica de `financeiro/page.tsx:1470-1496`:

```ts
// Converte vendas em lançamentos exibidos no financeiro.
// Extraído de app/(dashboard)/financeiro/page.tsx sem alteração de comportamento.

export type InstallmentInput = {
  id: string;
  number: number;
  amount: number;
  netValue: number | null;
  dueDate: string | null;
  cashDate: string | null;
  paidAt: string | null;
  status: string;
  label: string | null;
  paymentMethod: string | null;
};

export type SaleInput = {
  id: string;
  description: string;
  negotiationType: string | null;
  grossValue: number | null;
  paymentMethod: string | null;
  installmentsCount: number;
  createdAt: string | null;
  client: { id: string; name: string };
  installments: InstallmentInput[];
};

export type SaleTx = {
  id: string;
  type: "receita";
  description: string;
  amount: number;
  category: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: null;
  client: { id: string; name: string };
  _saleId: string;
  _installmentId?: string;
};

export function buildSaleTxs(
  sales: SaleInput[],
  existingInstallmentIds: Set<string>,
): SaleTx[] {
  return sales.flatMap(sale => {
    const isCard = sale.negotiationType === "card";
    const txList: SaleTx[] = [];

    if (isCard && sale.grossValue && !existingInstallmentIds.has(`rev_${sale.id}`)) {
      txList.push({
        id: `rev_${sale.id}`, type: "receita",
        description: `${sale.description} (faturamento)`,
        amount: sale.grossValue, category: "Faturamento", status: "pago",
        dueDate: sale.createdAt ?? null, paidAt: sale.createdAt ?? null,
        paymentMethod: sale.paymentMethod ?? null, notes: null,
        client: sale.client, _saleId: sale.id,
      });
    }

    const instTxs = sale.installments
      .filter(inst => !existingInstallmentIds.has(inst.id))
      .map(inst => {
        const cashAmt = isCard && inst.netValue ? inst.netValue : inst.amount;
        const suffix = inst.label
          ? ` — ${inst.label}`
          : sale.installmentsCount > 1
            ? ` (${inst.number}/${sale.installmentsCount})`
            : "";
        return {
          id: `inst_${inst.id}`, type: "receita" as const,
          description: isCard
            ? `${sale.description}${suffix} (caixa)`
            : `${sale.description}${suffix}`,
          amount: cashAmt,
          category: isCard
            ? "Caixa"
            : sale.installmentsCount === 1 ? "Consultoria anual" : "Parcela",
          status: inst.status, dueDate: inst.dueDate ?? null, paidAt: inst.paidAt ?? null,
          paymentMethod: sale.paymentMethod ?? null, notes: null,
          client: sale.client, _saleId: sale.id, _installmentId: inst.id,
        };
      });

    return [...txList, ...instTxs];
  });
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Usar o módulo na página do financeiro**

Em `src/app/(dashboard)/financeiro/page.tsx`, substituir o bloco `const installmentTxs: Tx[] = sales.flatMap(...)` (linhas 1470-1496) por:

```tsx
  const installmentTxs = buildSaleTxs(
    sales as unknown as SaleInput[],
    installmentIds,
  ) as unknown as Tx[];
```

E adicionar no topo do arquivo:

```tsx
import { buildSaleTxs, type SaleInput } from "@/lib/financeiro/saleTxs";
```

- [ ] **Step 6: Verificar compilação e comportamento**

Run: `npx tsc --noEmit`
Expected: sem erros

Com `npm run dev`, abrir `http://localhost:3000/financeiro` e confirmar que **os valores permanecem idênticos aos de antes** — esta task não muda nada visível.

- [ ] **Step 7: Commit**

```bash
git add src/lib/financeiro/saleTxs.ts src/lib/financeiro/saleTxs.test.ts src/app/\(dashboard\)/financeiro/page.tsx
git commit -m "refactor(finance): extract sale-to-transaction mapping into tested module"
```

---

### Task 7: Faturamento e caixa por linha

Agora sim a mudança de comportamento, isolada e revisável.

**Files:**
- Modify: `src/lib/financeiro/saleTxs.ts`
- Modify: `src/lib/financeiro/saleTxs.test.ts`

**Interfaces:**
- Consumes: `buildSaleTxs` (Task 6)
- Produces: `buildSaleTxs` com semântica nova — faturamento pelo bruto na `dueDate`, caixa pelo líquido na `cashDate`, forma de pagamento vinda da linha

- [ ] **Step 1: Escrever os testes da semântica nova**

Substituir o `describe("buildSaleTxs — comportamento atual", ...)` em `saleTxs.test.ts` por:

```ts
describe("buildSaleTxs — por linha", () => {
  it("cada parcela gera faturamento pelo bruto e caixa pelo liquido", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 1000, netValue: 950, dueDate: "2026-07-27",
          cashDate: "2026-07-28", paidAt: null, status: "pendente",
          label: "Entrada", paymentMethod: "Cartão" },
      ],
    })], new Set());

    const fat = txs.find(t => t.category === "Faturamento");
    const cx  = txs.find(t => t.category === "Caixa");

    expect(fat?.amount).toBe(1000);
    expect(fat?.dueDate).toBe("2026-07-27");
    expect(cx?.amount).toBe(950);
    expect(cx?.dueDate).toBe("2026-07-28");
  });

  it("usa a forma de pagamento da linha, nao a da venda", () => {
    const txs = buildSaleTxs([sale({
      paymentMethod: "Pix",
      installments: [
        { id: "i1", number: 1, amount: 600, netValue: 600, dueDate: "2026-08-27",
          cashDate: "2026-08-28", paidAt: null, status: "pendente",
          label: "Restante", paymentMethod: "Cartão" },
      ],
    })], new Set());

    expect(txs.every(t => t.paymentMethod === "Cartão")).toBe(true);
  });

  it("linhas da mesma venda podem ter formas de pagamento diferentes", () => {
    const txs = buildSaleTxs([sale({
      installmentsCount: 2,
      installments: [
        { id: "i1", number: 1, amount: 400, netValue: 400, dueDate: "2026-07-27",
          cashDate: "2026-07-27", paidAt: null, status: "pago",
          label: "Entrada", paymentMethod: "Pix" },
        { id: "i2", number: 2, amount: 600, netValue: 570, dueDate: "2026-08-27",
          cashDate: "2026-08-28", paidAt: null, status: "pendente",
          label: "Restante", paymentMethod: "Cartão" },
      ],
    })], new Set());

    const metodos = txs.map(t => t.paymentMethod);
    expect(metodos).toContain("Pix");
    expect(metodos).toContain("Cartão");
  });

  it("sem cashDate usa a dueDate como fallback", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          cashDate: null, paidAt: null, status: "pendente",
          label: null, paymentMethod: null },
      ],
    })], new Set());

    const cx = txs.find(t => t.category === "Caixa");
    expect(cx?.dueDate).toBe("2026-07-27");
    expect(cx?.amount).toBe(500);
  });

  it("ignora parcelas ja lancadas manualmente", () => {
    const txs = buildSaleTxs([sale({
      installments: [
        { id: "i1", number: 1, amount: 500, netValue: null, dueDate: "2026-07-27",
          cashDate: null, paidAt: null, status: "pendente",
          label: null, paymentMethod: "Pix" },
      ],
    })], new Set(["i1"]));

    expect(txs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test`
Expected: FAIL — a lógica antiga ainda ramifica por `negotiationType`

- [ ] **Step 3: Reescrever `buildSaleTxs`**

Substituir a função `buildSaleTxs` em `src/lib/financeiro/saleTxs.ts` por:

```ts
export function buildSaleTxs(
  sales: SaleInput[],
  existingInstallmentIds: Set<string>,
): SaleTx[] {
  return sales.flatMap(sale =>
    sale.installments
      .filter(inst => !existingInstallmentIds.has(inst.id))
      .flatMap(inst => {
        const suffix = inst.label
          ? ` — ${inst.label}`
          : sale.installmentsCount > 1
            ? ` (${inst.number}/${sale.installmentsCount})`
            : "";
        const metodo   = inst.paymentMethod ?? sale.paymentMethod ?? null;
        const liquido  = inst.netValue ?? inst.amount;
        const dataCaixa = inst.cashDate ?? inst.dueDate ?? null;
        const base = {
          type: "receita" as const,
          status: inst.status,
          paidAt: inst.paidAt ?? null,
          paymentMethod: metodo,
          notes: null,
          client: sale.client,
          _saleId: sale.id,
          _installmentId: inst.id,
        };

        return [
          {
            ...base,
            id: `fat_${inst.id}`,
            description: `${sale.description}${suffix} (faturamento)`,
            amount: inst.amount,
            category: "Faturamento",
            dueDate: inst.dueDate ?? null,
          },
          {
            ...base,
            id: `inst_${inst.id}`,
            description: `${sale.description}${suffix}`,
            amount: liquido,
            category: "Caixa",
            dueDate: dataCaixa,
          },
        ];
      }),
  );
}
```

Nota: o id `inst_<id>` é mantido para a linha de caixa porque `financeiro/page.tsx:1515` depende desse prefixo para marcar parcelas como pagas (`id.startsWith("inst_")`).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`

Abrir `http://localhost:3000/financeiro` e confirmar:
- Vendas antigas continuam aparecendo
- Marcar uma parcela como paga continua funcionando
- Uma venda mista (criada na Task 5) aparece com as formas de pagamento corretas por linha

- [ ] **Step 6: Commit**

```bash
git add src/lib/financeiro/saleTxs.ts src/lib/financeiro/saleTxs.test.ts
git commit -m "feat(finance): compute revenue and cash per receivable line"
```

---

### Task 8: Alinhar os demais pontos de criação de venda

Três lugares criam vendas fora do formulário principal e ainda fixam `negotiationType: "pix"`, sem gravar forma de pagamento por parcela.

**Files:**
- Modify: `src/app/(dashboard)/crm/page.tsx:371-390`
- Modify: `src/lib/openclaw/actions.ts:230-250`
- Modify: `src/lib/infinitepay-webhook.ts:110-125`

**Interfaces:**
- Consumes: `defaultCashDate` (Task 2); API da Task 3
- Produces: vendas criadas por esses caminhos com `paymentMethod` e `cashDate` por parcela

- [ ] **Step 1: CRM — gravar forma de pagamento e data de caixa por parcela**

Em `src/app/(dashboard)/crm/page.tsx`, substituir o bloco de geração de parcelas e o corpo do `fetch` (linhas 368-386) por:

```tsx
      const count = parseInt(payment.installments) || 1;
      const perParcela = parseFloat(payment.totalAmount) / count;
      const firstDue = new Date(payment.firstDueDate + "T12:00:00");
      const metodo = payment.paymentMethod || "Pix";
      const customInstallments = Array.from({ length: count }, (_, i) => {
        const d = new Date(firstDue);
        d.setMonth(d.getMonth() + i);
        const dueIso = d.toISOString().slice(0, 10);
        return {
          amount: perParcela,
          netValue: perParcela,
          dueDate: dueIso,
          cashDate: defaultCashDate(dueIso, metodo),
          paymentMethod: metodo,
          label: count === 1 ? "Pagamento" : `${i + 1}ª parcela`,
        };
      });
      await fetch("/api/financeiro/vendas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: student.id,
          description: payment.description,
          totalAmount: parseFloat(payment.totalAmount),
          paymentMethod: metodo,
          negotiationType: count === 1 ? "cash" : "custom",
          customInstallments,
        }),
      });
```

Adicionar o import no topo do arquivo:

```tsx
import { defaultCashDate } from "@/lib/financeiro/receivables";
```

- [ ] **Step 2: OpenClaw — mesmo ajuste (via Prisma, datas são `Date`)**

Em `src/lib/openclaw/actions.ts`, substituir o laço que cria as parcelas (linhas 245-259) por:

```ts
    const metodo = data.paymentMethod || "Pix";

    for (let i = 1; i <= enriched.planInstallments; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
      dueDate.setDate(today.getDate()); // mesmo dia do mês
      const cashIso = defaultCashDate(dueDate.toISOString().slice(0, 10), metodo);
      await prisma.installment.create({
        data: {
          number: i,
          amount: installmentAmount,
          netValue: installmentAmount,
          dueDate,
          cashDate: new Date(cashIso + "T12:00"),
          paymentMethod: metodo,
          status: "pendente",
          saleId: sale.id,
          label: i === 1 ? "1ª parcela" : `${i}ª parcela`,
        },
      });
    }
```

Na criação da `sale` logo acima (linha 239), trocar `negotiationType: "pix"` por:

```ts
        negotiationType: enriched.planInstallments === 1 ? "cash" : "custom",
```

Adicionar o import no topo:

```ts
import { defaultCashDate } from "@/lib/financeiro/receivables";
```

- [ ] **Step 3: Webhook InfinitePay — usar a forma real e separar bruto de líquido**

Em `src/lib/infinitepay-webhook.ts`, substituir a criação da parcela (linhas 122-132) por:

```ts
  const metodo = opts.paymentMethod === "card" ? "Cartão" : "Pix";

  const installment = await tx.installment.create({
    data: {
      number: 1,
      amount: opts.grossValue ?? opts.netValue, // faturamento = bruto
      netValue: opts.netValue,                  // caixa = líquido
      dueDate: opts.paidAt,
      cashDate: opts.paidAt,                    // pagamento confirmado: já entrou
      paymentMethod: metodo,
      paidAt: opts.paidAt,
      status: "pago",
      label: "Parcela única",
      saleId: sale.id,
    },
  });
```

Este ajuste é o que faz o checkout registrar faturamento pelo bruto e caixa pelo
líquido, em vez de usar o líquido nos dois. Nenhum import novo é necessário.

- [ ] **Step 4: Verificar a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Verificar a suíte**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/crm/page.tsx src/lib/openclaw/actions.ts src/lib/infinitepay-webhook.ts
git commit -m "feat(finance): record payment method and cash date on all sale entry points"
```

---

### Task 9: Verificação dos critérios de sucesso

Validação manual dos 8 critérios da spec, com dados reais.

**Files:** nenhum (verificação)

**Interfaces:**
- Consumes: tudo das tasks anteriores
- Produces: confirmação de que a spec foi atendida

- [ ] **Step 1: Subir o ambiente**

```bash
npm run dev
```

- [ ] **Step 2: Rodar a suíte completa**

Run: `npm test`
Expected: PASS — todos os testes de `receivables.test.ts` e `saleTxs.test.ts`

- [ ] **Step 3: Verificar cada critério da spec**

Em `http://localhost:3000/alunos`, criar uma venda para cada caso e confirmar que salva e aparece corretamente:

- [ ] Entrada no Pix + restante parcelado no cartão
- [ ] Venda dividida em dois cartões diferentes
- [ ] Venda em que a empresa assume os juros (caixa menor que faturamento)
- [ ] Pagamento único à vista
- [ ] Entrada + restante no Pix alguns dias depois
- [ ] Em `/financeiro`: faturamento e caixa do mês batem com o esperado
- [ ] Vendas antigas continuam visíveis e corretas
- [ ] Cada atalho monta as linhas certas e permite editar tudo depois

- [ ] **Step 4: Registrar o resultado**

Se algum critério falhar, anotar exatamente o que foi observado e corrigir antes de encerrar. Não declarar concluído com critério pendente.

- [ ] **Step 5: Commit final (se houve correção)**

```bash
git add -A
git commit -m "fix(finance): address issues found during success-criteria verification"
```

---

## Fora deste plano

Conforme a spec, **não** fazem parte desta entrega:

- Checklist de fechamento/onboarding por aluno (passo 2 do roadmap)
- CRM de alunos e jornada (passo 3)
- Integração WhatsApp / comandos via Telegram (passo 4)
- Decisão sobre tarefas (TickTick vs. módulo interno)
- Reestruturação do Notion

**Sobre a divisão do arquivo monolítico:** a spec previa dividir
`financeiro/page.tsx` (1.683 linhas) em formulário, tabelas, fechamento e filtros.
Este plano extrai a parte que a funcionalidade toca — o mapeamento venda→lançamentos
(Task 6) — e o formulário de venda passa a viver em `components/financeiro/`
(Task 4). A divisão das demais seções (fechamento mensal, filtros, tabelas de
listagem) **não** está incluída: é refatoração pura, sem relação com os critérios
de sucesso, e melhor executada como trabalho próprio antes do passo 2 do roadmap,
que voltará a mexer nesse módulo.

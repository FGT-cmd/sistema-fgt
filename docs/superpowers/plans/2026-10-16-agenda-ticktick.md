# Agenda FGT + TickTick — Plano A: sincronização e visões

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar nos dois sentidos as tarefas do Sistema FGT (`TodoTask`) com as listas 💼 Work, 💰 Financeiro e 📚 Estudos do TickTick, e trocar a aba `/agenda` por 4 visões (Hoje, 7 dias, Calendário, Matriz) com tarefas + eventos do Google, concluir, criar e editar.

**Architecture:** O banco do sistema é a central. Um planejador puro (`syncPlan`) compara tarefas locais e remotas e devolve ações; um executor aplica as ações via cliente HTTP do TickTick e Prisma, com uma trava em banco. As visões são funções puras sobre uma lista de `AgendaItem` (tarefas + eventos), servida por `GET /api/agenda/items`. A sincronização roda ao abrir a Agenda, após cada escrita de tarefa e no cron das 07h.

**Tech Stack:** Next.js 16 (App Router, `after()`), TypeScript, Prisma 7 + Neon, React 19, Tailwind 4, Vitest 4, TickTick Open API v1, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-16-agenda-ticktick-design.md`

## Global Constraints

- **Next.js 16 tem breaking changes.** Consultar `node_modules/next/dist/docs/` antes de usar API do Next não mostrada aqui.
- **Prisma: `npx prisma db push`, nunca `migrate dev`.** Mudanças só aditivas. O banco do `.env` é PRODUÇÃO.
- **Módulos puros não importam `@/lib/prisma` nem fazem rede.** Testes unitários nunca tocam banco nem TickTick.
- **Listas sincronizadas (nome sem emoji):** `Work`, `Financeiro`, `Estudos`. Qualquer outra lista do TickTick (Pessoal, Fitness, Brainstorm…) **nunca** entra no sistema.
- **Lista padrão para tarefa nova do sistema:** `Financeiro` se `type === "financial"`, senão `Work`. Lista escolhida no formulário prevalece.
- **Prioridade:** TickTick `5↔alta`, `3↔media`, `1↔baixa`, `0↔nenhuma`. Na leitura, `high/medium/low` contam como `alta/media/baixa`.
- **Matriz:** alta = Q1 "Urgente e importante"; media = Q2 "Importante"; baixa = Q3 "Urgente"; nenhuma = Q4 "Nem um nem outro".
- **Datas:** fuso `America/Sao_Paulo`. Dia inteiro no TickTick = `YYYY-MM-DDT03:00:00.000+0000`, `isAllDay: true`, `timeZone: "America/Sao_Paulo"`. Dia inteiro no sistema = `new Date("YYYY-MM-DDT00:00:00.000Z")` (mesma convenção do `POST /api/tarefas` atual, que faz `new Date("YYYY-MM-DD")`). Horário marcado = instante real nos dois lados.
- **Status:** TickTick `status 2` = concluída ↔ sistema `done`; sistema `cancelled` → apaga no TickTick; `waiting` continua aberta no TickTick.
- **Conflito:** mudou dos dois lados desde a última sincronização → vence o mais recente (`updatedAt` local × `modifiedTime` remoto). Folga de 5 s (`SYNC_SLACK_MS = 5000`) para não confundir a própria escrita da sincronização com mudança do usuário.
- **Token:** `TICKTICK_ACCESS_TOKEN` (mesmo da ponte do Jarvis). 401 → `authBroken = true`, nada é apagado.
- **Identidade visual:** acento `#E91E90`, títulos DM Serif Display, corpo Manrope (padrão do checkout/financeiro).
- **Idioma:** identificadores em inglês; textos de tela em português.
- **Commits:** um por task, terminando com o trailer de co-autoria da sessão.

---

## Mapa de arquivos

```
prisma/schema.prisma                         (modificar) campos de sync em TodoTask + TickTickSyncState

src/lib/ticktick/
  types.ts            puro   RemoteTask, ListName, SYNCED_LISTS
  mapping.ts          puro   prioridade, datas, lista, remoto↔local
  client.ts           rede   chamadas à Open API (sem teste unitário)
  syncPlan.ts         puro   planejador
  syncRunner.ts       banco+rede  executor, trava, estado
src/lib/agenda/
  views.ts            puro   AgendaItem + agrupamentos das 4 visões

src/app/api/agenda/sync/route.ts             (criar) POST roda, GET status
src/app/api/agenda/items/route.ts            (criar) GET tarefas abertas + eventos
src/app/api/tarefas/route.ts                 (modificar) campos novos + sync após criar
src/app/api/tarefas/[id]/route.ts            (modificar) campos novos + sync após editar/apagar
src/app/api/cron/jarvis/route.ts             (modificar) sync no slot morning

src/app/(dashboard)/agenda/page.tsx          (reescrever) abas + carregamento
src/app/(dashboard)/agenda/components/
  TaskRow.tsx  TaskForm.tsx  SyncBadge.tsx
  TodayView.tsx  WeekView.tsx  CalendarView.tsx  MatrixView.tsx
  GooglePanel.tsx    conexão Google + novo evento (código movido da página atual)
```

---

### Task 1: Schema e tipos do TickTick

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/ticktick/types.ts`

**Interfaces:**
- Produces: campos `TodoTask.tickTickId/tickTickProjectId/tickTickEtag/tickTickModified/syncedAt/allDay/isRecurring/listName`; modelo `TickTickSyncState`; em `types.ts`: `ListName`, `SYNCED_LISTS`, `RemoteTask`, `Priority`.

- [ ] **Step 1: Schema**

No `model TodoTask`, depois de `completedAt DateTime?`, adicionar:

```prisma
  tickTickId        String?   @unique
  tickTickProjectId String?
  tickTickEtag      String?
  tickTickModified  DateTime?
  syncedAt          DateTime?
  allDay            Boolean   @default(true)
  isRecurring       Boolean   @default(false)
  listName          String?
```

No fim do arquivo:

```prisma
// Estado da sincronização com o TickTick (uma linha, id "main")
model TickTickSyncState {
  id           String    @id @default("main")
  runningSince DateTime?
  lastRunAt    DateTime?
  lastOkAt     DateTime?
  lastError    String?
  authBroken   Boolean   @default(false)
  updatedAt    DateTime  @updatedAt
}
```

Run: `npx prisma format && npx prisma db push && npx prisma generate`
Expected: só colunas/tabela novas; **pare** se aparecer aviso de perda de dados.

- [ ] **Step 2: Tipos**

Criar `src/lib/ticktick/types.ts`:

```ts
// Tipos da integração com o TickTick (Open API v1).

export const SYNCED_LISTS = ["Work", "Financeiro", "Estudos"] as const;
export type ListName = (typeof SYNCED_LISTS)[number];

export type Priority = "alta" | "media" | "baixa" | "nenhuma";

/** Tarefa do TickTick já normalizada para o domínio. */
export type RemoteTask = {
  id: string;
  projectId: string;
  listName: ListName;
  title: string;
  content: string;
  dueDate: string | null;   // ISO UTC (o executor converte do formato do TickTick)
  isAllDay: boolean;
  priority: 0 | 1 | 3 | 5;
  modifiedTime: string | null; // ISO UTC
  isRecurring: boolean;
  etag: string | null;
};

/** Formato cru devolvido pela API (só os campos usados). */
export type TickTickApiTask = {
  id: string;
  projectId: string;
  title?: string;
  content?: string;
  desc?: string;
  dueDate?: string;
  startDate?: string;
  isAllDay?: boolean;
  priority?: number;
  status?: number;
  modifiedTime?: string;
  repeatFlag?: string;
  etag?: string;
};

export type TickTickApiProject = { id: string; name: string; closed?: boolean | null };
```

- [ ] **Step 3: Checar e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; suíte verde.

```bash
git add prisma/schema.prisma src/lib/ticktick/types.ts
git commit -m "feat(agenda): TickTick sync fields and types"
```

---

### Task 2: Mapeamentos (puro)

**Files:**
- Create: `src/lib/ticktick/mapping.ts`, `src/lib/ticktick/mapping.test.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 1).
- Produces:
  - `normalizePriority(raw: string | null | undefined): Priority`
  - `priorityToTickTick(p: Priority): 0 | 1 | 3 | 5`, `priorityFromTickTick(n: number | undefined): Priority`
  - `listNameFromProject(name: string): ListName | null` (tira emoji/espaços; compara sem acento/caixa)
  - `defaultListFor(type: string): ListName`
  - `parseTickTickDate(raw: string | undefined): string | null` (`"2026-10-16T03:00:00.000+0000"` → `"2026-10-16T03:00:00.000Z"`)
  - `formatTickTickDate(iso: string): string` (inverso)
  - `toRemoteTask(api: TickTickApiTask, listName: ListName): RemoteTask`
  - `remoteToLocalFields(r: RemoteTask): LocalTaskFields`
  - `localToTickTickPayload(l: LocalTaskForPush, projectId: string): Record<string, unknown>`
  - tipos `LocalTaskFields = { title: string; description: string | null; dueDate: Date | null; allDay: boolean; priority: Priority; listName: ListName; isRecurring: boolean }` e `LocalTaskForPush = { title: string; description: string | null; dueDate: Date | null; allDay: boolean; priority: string; tickTickId: string | null }`
  - `saoPauloDay(d: Date): string`

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/ticktick/mapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizePriority, priorityToTickTick, priorityFromTickTick, listNameFromProject, defaultListFor,
  parseTickTickDate, formatTickTickDate, toRemoteTask, remoteToLocalFields, localToTickTickPayload, saoPauloDay,
} from "./mapping";

describe("prioridade", () => {
  it("normaliza valores antigos e desconhecidos", () => {
    expect(normalizePriority("alta")).toBe("alta");
    expect(normalizePriority("high")).toBe("alta");
    expect(normalizePriority("medium")).toBe("media");
    expect(normalizePriority("low")).toBe("baixa");
    expect(normalizePriority("nenhuma")).toBe("nenhuma");
    expect(normalizePriority(null)).toBe("media");
    expect(normalizePriority("xyz")).toBe("media");
  });
  it("ida e volta com o TickTick", () => {
    expect(priorityToTickTick("alta")).toBe(5);
    expect(priorityToTickTick("nenhuma")).toBe(0);
    expect(priorityFromTickTick(3)).toBe("media");
    expect(priorityFromTickTick(1)).toBe("baixa");
    expect(priorityFromTickTick(0)).toBe("nenhuma");
    expect(priorityFromTickTick(undefined)).toBe("nenhuma");
  });
});

describe("listas", () => {
  it("reconhece as listas sincronizadas com emoji e sem acento", () => {
    expect(listNameFromProject("💼Work")).toBe("Work");
    expect(listNameFromProject("💰 Financeiro")).toBe("Financeiro");
    expect(listNameFromProject("📚Estudos")).toBe("Estudos");
    expect(listNameFromProject("🏠Pessoal")).toBeNull();
    expect(listNameFromProject("🧠Brainstorm")).toBeNull();
  });
  it("lista padrão por tipo", () => {
    expect(defaultListFor("financial")).toBe("Financeiro");
    expect(defaultListFor("commercial")).toBe("Work");
  });
});

describe("datas", () => {
  it("formato do TickTick ↔ ISO", () => {
    expect(parseTickTickDate("2026-10-16T03:00:00.000+0000")).toBe("2026-10-16T03:00:00.000Z");
    expect(parseTickTickDate(undefined)).toBeNull();
    expect(formatTickTickDate("2026-10-16T03:00:00.000Z")).toBe("2026-10-16T03:00:00.000+0000");
  });
  it("dia em São Paulo", () => {
    expect(saoPauloDay(new Date("2026-10-17T02:30:00Z"))).toBe("2026-10-16");
  });
});

describe("remoto ↔ local", () => {
  const api = {
    id: "t1", projectId: "p1", title: "Gravar reels", content: "roteiro 3",
    dueDate: "2026-10-16T03:00:00.000+0000", isAllDay: true, priority: 5,
    modifiedTime: "2026-10-15T10:00:00.000+0000", repeatFlag: "RRULE:FREQ=WEEKLY", etag: "e1",
  };
  it("dia inteiro vira meia-noite UTC do dia de São Paulo", () => {
    const r = toRemoteTask(api, "Work");
    expect(r).toMatchObject({ isRecurring: true, priority: 5, modifiedTime: "2026-10-15T10:00:00.000Z" });
    const l = remoteToLocalFields(r);
    expect(l.dueDate?.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(l).toMatchObject({ title: "Gravar reels", description: "roteiro 3", allDay: true, priority: "alta", listName: "Work", isRecurring: true });
  });
  it("horário marcado mantém o instante", () => {
    const r = toRemoteTask({ ...api, isAllDay: false, dueDate: "2026-10-16T17:30:00.000+0000", repeatFlag: "" }, "Work");
    expect(remoteToLocalFields(r).dueDate?.toISOString()).toBe("2026-10-16T17:30:00.000Z");
    expect(r.isRecurring).toBe(false);
  });
  it("local → payload do TickTick", () => {
    const allDay = localToTickTickPayload(
      { title: "Cobrar Aleska", description: null, dueDate: new Date("2026-10-20T00:00:00.000Z"), allDay: true, priority: "high", tickTickId: null },
      "p1",
    );
    expect(allDay).toEqual({
      title: "Cobrar Aleska", content: "", projectId: "p1", priority: 5, isAllDay: true,
      timeZone: "America/Sao_Paulo", dueDate: "2026-10-20T03:00:00.000+0000", startDate: "2026-10-20T03:00:00.000+0000",
    });
    const timed = localToTickTickPayload(
      { title: "Call", description: "x", dueDate: new Date("2026-10-20T17:00:00.000Z"), allDay: false, priority: "baixa", tickTickId: "t9" },
      "p1",
    );
    expect(timed).toMatchObject({ id: "t9", isAllDay: false, dueDate: "2026-10-20T17:00:00.000+0000", priority: 1 });
    const noDate = localToTickTickPayload({ title: "Sem data", description: null, dueDate: null, allDay: true, priority: "media", tickTickId: null }, "p1");
    expect(noDate).not.toHaveProperty("dueDate");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ticktick/mapping.test.ts`
Expected: FAIL ("Failed to resolve import ./mapping").

- [ ] **Step 3: Implementar**

Criar `src/lib/ticktick/mapping.ts`:

```ts
// Conversões entre o TickTick e o TodoTask do sistema. Puro.

import { SYNCED_LISTS, type ListName, type Priority, type RemoteTask, type TickTickApiTask } from "./types";

const TZ = "America/Sao_Paulo";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase();

export function normalizePriority(raw: string | null | undefined): Priority {
  switch ((raw ?? "").toLowerCase()) {
    case "alta": case "high": return "alta";
    case "baixa": case "low": return "baixa";
    case "nenhuma": case "none": return "nenhuma";
    default: return "media";
  }
}

export function priorityToTickTick(p: Priority): 0 | 1 | 3 | 5 {
  return p === "alta" ? 5 : p === "media" ? 3 : p === "baixa" ? 1 : 0;
}

export function priorityFromTickTick(n: number | undefined): Priority {
  return n === 5 ? "alta" : n === 3 ? "media" : n === 1 ? "baixa" : "nenhuma";
}

export function listNameFromProject(name: string): ListName | null {
  const n = norm(name);
  return SYNCED_LISTS.find((l) => norm(l) === n) ?? null;
}

export function defaultListFor(type: string): ListName {
  return type === "financial" ? "Financeiro" : "Work";
}

export function parseTickTickDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatTickTickDate(iso: string): string {
  return iso.replace(/Z$/, "+0000");
}

export function saoPauloDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function toRemoteTask(api: TickTickApiTask, listName: ListName): RemoteTask {
  const p = api.priority;
  return {
    id: api.id,
    projectId: api.projectId,
    listName,
    title: api.title ?? "",
    content: api.content ?? api.desc ?? "",
    dueDate: parseTickTickDate(api.dueDate),
    isAllDay: api.isAllDay !== false,
    priority: p === 5 || p === 3 || p === 1 ? p : 0,
    modifiedTime: parseTickTickDate(api.modifiedTime),
    isRecurring: !!api.repeatFlag,
    etag: api.etag ?? null,
  };
}

export type LocalTaskFields = {
  title: string;
  description: string | null;
  dueDate: Date | null;
  allDay: boolean;
  priority: Priority;
  listName: ListName;
  isRecurring: boolean;
};

export function remoteToLocalFields(r: RemoteTask): LocalTaskFields {
  let dueDate: Date | null = null;
  if (r.dueDate) {
    dueDate = r.isAllDay
      ? new Date(`${saoPauloDay(new Date(r.dueDate))}T00:00:00.000Z`)
      : new Date(r.dueDate);
  }
  return {
    title: r.title,
    description: r.content || null,
    dueDate,
    allDay: r.isAllDay,
    priority: priorityFromTickTick(r.priority),
    listName: r.listName,
    isRecurring: r.isRecurring,
  };
}

export type LocalTaskForPush = {
  title: string;
  description: string | null;
  dueDate: Date | null;
  allDay: boolean;
  priority: string;
  tickTickId: string | null;
};

export function localToTickTickPayload(l: LocalTaskForPush, projectId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(l.tickTickId ? { id: l.tickTickId } : {}),
    title: l.title,
    content: l.description ?? "",
    projectId,
    priority: priorityToTickTick(normalizePriority(l.priority)),
    isAllDay: l.allDay,
    timeZone: TZ,
  };
  if (l.dueDate) {
    const due = l.allDay
      ? `${l.dueDate.toISOString().slice(0, 10)}T03:00:00.000+0000`
      : formatTickTickDate(l.dueDate.toISOString());
    payload.dueDate = due;
    payload.startDate = due;
  }
  return payload;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ticktick/mapping.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commitar**

```bash
git add src/lib/ticktick/mapping.ts src/lib/ticktick/mapping.test.ts
git commit -m "feat(agenda): TickTick ↔ TodoTask mapping"
```

---

### Task 3: Cliente da Open API do TickTick

**Files:**
- Create: `src/lib/ticktick/client.ts`

**Interfaces:**
- Consumes: `types.ts`, `mapping.ts`.
- Produces: `class TickTickAuthError extends Error`, `class TickTickNotFoundError extends Error`, e funções:
  `listSyncedProjects(): Promise<{ id: string; listName: ListName }[]>`,
  `listOpenTasks(projectId: string, listName: ListName): Promise<RemoteTask[]>`,
  `getTask(projectId: string, taskId: string): Promise<TickTickApiTask>` (lança `TickTickNotFoundError` em 404/resposta vazia),
  `createTask(payload: Record<string, unknown>): Promise<TickTickApiTask>`,
  `updateTask(taskId: string, payload: Record<string, unknown>): Promise<TickTickApiTask>`,
  `completeTask(projectId: string, taskId: string): Promise<void>`,
  `deleteTask(projectId: string, taskId: string): Promise<void>`.

Sem teste unitário (é rede). Verificação: `tsc` + uso real na Task 8.

- [ ] **Step 1: Implementar**

Criar `src/lib/ticktick/client.ts`:

```ts
// Cliente mínimo da TickTick Open API v1 (https://api.ticktick.com/open/v1).
// Token: TICKTICK_ACCESS_TOKEN (mesmo da ponte do Jarvis; sem refresh automático).

import { listNameFromProject, toRemoteTask } from "./mapping";
import type { ListName, RemoteTask, TickTickApiProject, TickTickApiTask } from "./types";

const API = "https://api.ticktick.com/open/v1";

export class TickTickAuthError extends Error {}
export class TickTickNotFoundError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.TICKTICK_ACCESS_TOKEN?.trim();
  if (!token) throw new TickTickAuthError("TICKTICK_ACCESS_TOKEN não configurado");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new TickTickAuthError(`TickTick ${res.status}`);
  if (res.status === 404) throw new TickTickNotFoundError(path);
  if (!res.ok) throw new Error(`TickTick ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function listSyncedProjects(): Promise<{ id: string; listName: ListName }[]> {
  const projects = (await call<TickTickApiProject[]>("/project")) ?? [];
  return projects.flatMap((p) => {
    const listName = !p.closed ? listNameFromProject(p.name) : null;
    return listName ? [{ id: p.id, listName }] : [];
  });
}

export async function listOpenTasks(projectId: string, listName: ListName): Promise<RemoteTask[]> {
  const data = await call<{ tasks?: TickTickApiTask[] }>(`/project/${projectId}/data`);
  return (data?.tasks ?? []).filter((t) => t.status !== 2).map((t) => toRemoteTask(t, listName));
}

export async function getTask(projectId: string, taskId: string): Promise<TickTickApiTask> {
  const t = await call<TickTickApiTask | null>(`/project/${projectId}/task/${taskId}`);
  if (!t || !t.id) throw new TickTickNotFoundError(taskId);
  return t;
}

export function createTask(payload: Record<string, unknown>): Promise<TickTickApiTask> {
  return call<TickTickApiTask>("/task", { method: "POST", body: JSON.stringify(payload) });
}

export function updateTask(taskId: string, payload: Record<string, unknown>): Promise<TickTickApiTask> {
  return call<TickTickApiTask>(`/task/${taskId}`, { method: "POST", body: JSON.stringify({ ...payload, id: taskId }) });
}

export async function completeTask(projectId: string, taskId: string): Promise<void> {
  await call(`/project/${projectId}/task/${taskId}/complete`, { method: "POST" });
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await call(`/project/${projectId}/task/${taskId}`, { method: "DELETE" });
}
```

- [ ] **Step 2: Checar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros. **Não** chamar a API real nesta task.

```bash
git add src/lib/ticktick/client.ts
git commit -m "feat(agenda): TickTick Open API client"
```

---

### Task 4: Planejador da sincronização (puro)

**Files:**
- Create: `src/lib/ticktick/syncPlan.ts`, `src/lib/ticktick/syncPlan.test.ts`

**Interfaces:**
- Consumes: `RemoteTask`, `ListName` (Task 1); `defaultListFor`, `saoPauloDay` (Task 2).
- Produces:

```ts
export const SYNC_SLACK_MS = 5000;
export type LocalTask = {
  id: string; title: string; description: string | null; dueDate: string | null; allDay: boolean;
  priority: string; status: string; type: string; listName: string | null;
  tickTickId: string | null; tickTickProjectId: string | null; tickTickModified: string | null;
  syncedAt: string | null; updatedAt: string; isRecurring: boolean;
};
export type SyncAction =
  | { kind: "pullCreate"; remote: RemoteTask }
  | { kind: "pullUpdate"; localId: string; remote: RemoteTask }
  | { kind: "link"; localId: string; remote: RemoteTask }
  | { kind: "pushCreate"; local: LocalTask; listName: ListName }
  | { kind: "pushUpdate"; local: LocalTask; listName: ListName; moveFromProjectId: string | null }
  | { kind: "pushComplete"; local: LocalTask }
  | { kind: "pushDelete"; local: LocalTask }
  | { kind: "checkMissing"; local: LocalTask };
export function planSync(locals: LocalTask[], remotes: RemoteTask[], projectIdByList: Record<ListName, string>): SyncAction[];
```

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/ticktick/syncPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planSync, type LocalTask } from "./syncPlan";
import type { RemoteTask } from "./types";

const PROJ = { Work: "pw", Financeiro: "pf", Estudos: "pe" } as const;

const local = (p: Partial<LocalTask> & Pick<LocalTask, "id">): LocalTask => ({
  title: "x", description: null, dueDate: null, allDay: true, priority: "media", status: "pending",
  type: "general", listName: null, tickTickId: null, tickTickProjectId: null, tickTickModified: null,
  syncedAt: null, updatedAt: "2026-10-16T10:00:00.000Z", isRecurring: false, ...p,
});
const remote = (p: Partial<RemoteTask> & Pick<RemoteTask, "id">): RemoteTask => ({
  projectId: "pw", listName: "Work", title: "x", content: "", dueDate: null, isAllDay: true, priority: 3,
  modifiedTime: "2026-10-16T10:00:00.000Z", isRecurring: false, etag: null, ...p,
});
const kinds = (a: { kind: string }[]) => a.map((x) => x.kind);

describe("planSync", () => {
  it("remota nova vira pullCreate; local nova vira pushCreate na lista padrão", () => {
    const acts = planSync([local({ id: "l1", type: "financial", title: "Pagar DAS" })], [remote({ id: "r1", title: "Gravar reels" })], PROJ);
    expect(acts).toContainEqual({ kind: "pullCreate", remote: expect.objectContaining({ id: "r1" }) });
    expect(acts).toContainEqual(expect.objectContaining({ kind: "pushCreate", listName: "Financeiro" }));
  });

  it("primeira sincronização liga pelo título e dia em vez de duplicar", () => {
    const acts = planSync(
      [local({ id: "l1", title: "Cobrar  Aleska", dueDate: "2026-10-20T00:00:00.000Z" })],
      [remote({ id: "r1", title: "cobrar aleska", dueDate: "2026-10-20T03:00:00.000Z" })],
      PROJ,
    );
    expect(kinds(acts)).toEqual(["link"]);
  });

  it("nada mudou → nenhuma ação", () => {
    const acts = planSync(
      [local({ id: "l1", tickTickId: "r1", tickTickProjectId: "pw", syncedAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T10:00:03.000Z", tickTickModified: "2026-10-16T09:00:00.000Z" })],
      [remote({ id: "r1", modifiedTime: "2026-10-16T09:00:00.000Z" })],
      PROJ,
    );
    expect(acts).toEqual([]);
  });

  it("só o remoto mudou → pullUpdate; só o local → pushUpdate", () => {
    const base = { tickTickId: "r1", tickTickProjectId: "pw", syncedAt: "2026-10-16T10:00:00.000Z", tickTickModified: "2026-10-16T09:00:00.000Z", listName: "Work" };
    expect(kinds(planSync([local({ id: "l1", ...base, updatedAt: "2026-10-16T10:00:01.000Z" })], [remote({ id: "r1", modifiedTime: "2026-10-16T11:00:00.000Z" })], PROJ))).toEqual(["pullUpdate"]);
    expect(kinds(planSync([local({ id: "l1", ...base, updatedAt: "2026-10-16T11:00:00.000Z" })], [remote({ id: "r1", modifiedTime: "2026-10-16T09:00:00.000Z" })], PROJ))).toEqual(["pushUpdate"]);
  });

  it("mudou dos dois lados → vence o mais recente", () => {
    const base = { tickTickId: "r1", tickTickProjectId: "pw", syncedAt: "2026-10-16T10:00:00.000Z", tickTickModified: "2026-10-16T09:00:00.000Z", listName: "Work" };
    expect(kinds(planSync([local({ id: "l1", ...base, updatedAt: "2026-10-16T12:00:00.000Z" })], [remote({ id: "r1", modifiedTime: "2026-10-16T11:00:00.000Z" })], PROJ))).toEqual(["pushUpdate"]);
    expect(kinds(planSync([local({ id: "l1", ...base, updatedAt: "2026-10-16T11:00:00.000Z" })], [remote({ id: "r1", modifiedTime: "2026-10-16T12:00:00.000Z" })], PROJ))).toEqual(["pullUpdate"]);
  });

  it("lista trocada no sistema → pushUpdate com mudança de projeto", () => {
    const acts = planSync(
      [local({ id: "l1", tickTickId: "r1", tickTickProjectId: "pw", listName: "Estudos", syncedAt: "2026-10-16T10:00:00.000Z", tickTickModified: "2026-10-16T09:00:00.000Z", updatedAt: "2026-10-16T11:00:00.000Z" })],
      [remote({ id: "r1", modifiedTime: "2026-10-16T09:00:00.000Z" })],
      PROJ,
    );
    expect(acts).toEqual([expect.objectContaining({ kind: "pushUpdate", listName: "Estudos", moveFromProjectId: "pw" })]);
  });

  it("concluída no sistema → pushComplete; cancelada → pushDelete", () => {
    const linked = { tickTickId: "r1", tickTickProjectId: "pw" };
    expect(kinds(planSync([local({ id: "l1", ...linked, status: "done" })], [remote({ id: "r1" })], PROJ))).toEqual(["pushComplete"]);
    expect(kinds(planSync([local({ id: "l1", ...linked, status: "cancelled" })], [remote({ id: "r1" })], PROJ))).toEqual(["pushDelete"]);
  });

  it("ligada e ausente das abertas → checkMissing (exceto se já concluída/cancelada)", () => {
    const linked = { tickTickId: "r1", tickTickProjectId: "pw" };
    expect(kinds(planSync([local({ id: "l1", ...linked })], [], PROJ))).toEqual(["checkMissing"]);
    expect(planSync([local({ id: "l1", ...linked, status: "done" })], [], PROJ)).toEqual([]);
    expect(planSync([local({ id: "l1", ...linked, status: "cancelled" })], [], PROJ)).toEqual([]);
  });

  it("locais concluídas/canceladas sem id nunca sobem", () => {
    expect(planSync([local({ id: "l1", status: "done" }), local({ id: "l2", status: "cancelled" })], [], PROJ)).toEqual([]);
  });

  it("uma remota liga com no máximo uma local", () => {
    const acts = planSync(
      [local({ id: "l1", title: "A", dueDate: null }), local({ id: "l2", title: "A", dueDate: null })],
      [remote({ id: "r1", title: "A" })],
      PROJ,
    );
    expect(kinds(acts).sort()).toEqual(["link", "pushCreate"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ticktick/syncPlan.test.ts`
Expected: FAIL ("Failed to resolve import ./syncPlan").

- [ ] **Step 3: Implementar**

Criar `src/lib/ticktick/syncPlan.ts`:

```ts
// Planejador da sincronização TodoTask ↔ TickTick. Puro: decide, não executa.

import { defaultListFor, saoPauloDay } from "./mapping";
import { SYNCED_LISTS, type ListName, type RemoteTask } from "./types";

export const SYNC_SLACK_MS = 5000;

export type LocalTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  allDay: boolean;
  priority: string;
  status: string;
  type: string;
  listName: string | null;
  tickTickId: string | null;
  tickTickProjectId: string | null;
  tickTickModified: string | null;
  syncedAt: string | null;
  updatedAt: string;
  isRecurring: boolean;
};

export type SyncAction =
  | { kind: "pullCreate"; remote: RemoteTask }
  | { kind: "pullUpdate"; localId: string; remote: RemoteTask }
  | { kind: "link"; localId: string; remote: RemoteTask }
  | { kind: "pushCreate"; local: LocalTask; listName: ListName }
  | { kind: "pushUpdate"; local: LocalTask; listName: ListName; moveFromProjectId: string | null }
  | { kind: "pushComplete"; local: LocalTask }
  | { kind: "pushDelete"; local: LocalTask }
  | { kind: "checkMissing"; local: LocalTask };

const OPEN = new Set(["pending", "waiting"]);
const t = (iso: string | null) => (iso ? Date.parse(iso) : 0);
const normTitle = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// Dia inteiro local é gravado como meia-noite UTC: o dia é a própria data, não a de SP.
const localDay = (l: LocalTask) => (!l.dueDate ? "" : l.allDay ? l.dueDate.slice(0, 10) : saoPauloDay(new Date(l.dueDate)));
const remoteDay = (r: RemoteTask) => (r.dueDate ? saoPauloDay(new Date(r.dueDate)) : "");

function listFor(l: LocalTask): ListName {
  const named = SYNCED_LISTS.find((n) => n === l.listName);
  return named ?? defaultListFor(l.type);
}

export function planSync(
  locals: LocalTask[],
  remotes: RemoteTask[],
  projectIdByList: Record<ListName, string>,
): SyncAction[] {
  const actions: SyncAction[] = [];
  const remoteById = new Map(remotes.map((r) => [r.id, r]));
  const claimed = new Set<string>();

  for (const l of locals) {
    if (!l.tickTickId) continue;
    claimed.add(l.tickTickId);
    const r = remoteById.get(l.tickTickId);

    if (!r) {
      // Fora das abertas: concluída, apagada ou movida no TickTick. Só investiga se aqui está aberta.
      if (OPEN.has(l.status)) actions.push({ kind: "checkMissing", local: l });
      continue;
    }
    if (l.status === "cancelled") {
      actions.push({ kind: "pushDelete", local: l });
      continue;
    }
    if (l.status === "done") {
      actions.push({ kind: "pushComplete", local: l });
      continue;
    }

    const localChanged = !l.syncedAt || t(l.updatedAt) - t(l.syncedAt) > SYNC_SLACK_MS;
    const remoteChanged = !l.tickTickModified || t(r.modifiedTime) > t(l.tickTickModified);
    const list = listFor(l);
    const moveFrom = projectIdByList[list] !== l.tickTickProjectId ? l.tickTickProjectId : null;

    if (localChanged && remoteChanged) {
      if (t(l.updatedAt) >= t(r.modifiedTime)) actions.push({ kind: "pushUpdate", local: l, listName: list, moveFromProjectId: moveFrom });
      else actions.push({ kind: "pullUpdate", localId: l.id, remote: r });
    } else if (localChanged) {
      actions.push({ kind: "pushUpdate", local: l, listName: list, moveFromProjectId: moveFrom });
    } else if (remoteChanged) {
      actions.push({ kind: "pullUpdate", localId: l.id, remote: r });
    }
  }

  const unclaimed = remotes.filter((r) => !claimed.has(r.id));
  for (const l of locals) {
    if (l.tickTickId || !OPEN.has(l.status)) continue;
    const match = unclaimed.find(
      (r) => !claimed.has(r.id) && normTitle(r.title) === normTitle(l.title) && remoteDay(r) === localDay(l),
    );
    if (match) {
      claimed.add(match.id);
      actions.push({ kind: "link", localId: l.id, remote: match });
    } else {
      actions.push({ kind: "pushCreate", local: l, listName: listFor(l) });
    }
  }

  for (const r of unclaimed) {
    if (!claimed.has(r.id)) actions.push({ kind: "pullCreate", remote: r });
  }
  return actions;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ticktick/syncPlan.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commitar**

```bash
git add src/lib/ticktick/syncPlan.ts src/lib/ticktick/syncPlan.test.ts
git commit -m "feat(agenda): pure two-way sync planner"
```

---

### Task 5: Executor da sincronização, rota e gatilhos

**Files:**
- Create: `src/lib/ticktick/syncRunner.ts`
- Create: `src/app/api/agenda/sync/route.ts`
- Modify: `src/app/api/tarefas/route.ts`, `src/app/api/tarefas/[id]/route.ts`
- Modify: `src/app/api/cron/jarvis/route.ts`

**Interfaces:**
- Consumes: client (Task 3), mapping (Task 2), syncPlan (Task 4), `getDefaultUser`, `prisma`.
- Produces:
  - `runTickTickSync(opts?: { dryRun?: boolean }): Promise<SyncSummary>` onde
    `SyncSummary = { ok: boolean; skipped?: "running"; authBroken?: boolean; error?: string; counts: Record<SyncAction["kind"], number>; actions?: { kind: string; title: string }[] }` (`actions` só em `dryRun`).
  - `getSyncStatus(): Promise<{ lastOkAt: string | null; lastRunAt: string | null; lastError: string | null; authBroken: boolean }>`
  - `deleteRemoteFor(taskId: string): Promise<void>` (apaga no TickTick antes do delete local; ignora 404).
  - `POST /api/agenda/sync` (corpo opcional `{ dryRun: true }`) → `SyncSummary`; `GET /api/agenda/sync` → status.

- [ ] **Step 1: Implementar o executor**

Criar `src/lib/ticktick/syncRunner.ts`:

```ts
// Executor da sincronização: carrega, planeja (syncPlan), aplica. Banco + rede.

import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import {
  TickTickAuthError, TickTickNotFoundError, completeTask, createTask, deleteTask, getTask,
  listOpenTasks, listSyncedProjects, updateTask,
} from "./client";
import { localToTickTickPayload, parseTickTickDate, remoteToLocalFields, toRemoteTask } from "./mapping";
import { planSync, type LocalTask, type SyncAction } from "./syncPlan";
import type { ListName, RemoteTask } from "./types";

const STATE_ID = "main";
const LOCK_STALE_MS = 2 * 60_000;

export type SyncSummary = {
  ok: boolean;
  skipped?: "running";
  authBroken?: boolean;
  error?: string;
  counts: Record<SyncAction["kind"], number>;
  actions?: { kind: string; title: string }[];
};

const emptyCounts = (): SyncSummary["counts"] => ({
  pullCreate: 0, pullUpdate: 0, link: 0, pushCreate: 0, pushUpdate: 0, pushComplete: 0, pushDelete: 0, checkMissing: 0,
});

async function claimLock(): Promise<boolean> {
  await prisma.tickTickSyncState.upsert({ where: { id: STATE_ID }, create: { id: STATE_ID }, update: {} });
  const { count } = await prisma.tickTickSyncState.updateMany({
    where: { id: STATE_ID, OR: [{ runningSince: null }, { runningSince: { lt: new Date(Date.now() - LOCK_STALE_MS) } }] },
    data: { runningSince: new Date(), lastRunAt: new Date() },
  });
  return count === 1;
}

function remoteSyncFields(r: RemoteTask) {
  return {
    tickTickId: r.id,
    tickTickProjectId: r.projectId,
    tickTickEtag: r.etag,
    tickTickModified: r.modifiedTime ? new Date(r.modifiedTime) : null,
    syncedAt: new Date(),
  };
}

function toLocalTask(t: {
  id: string; title: string; description: string | null; dueDate: Date | null; allDay: boolean; priority: string;
  status: string; type: string; listName: string | null; tickTickId: string | null; tickTickProjectId: string | null;
  tickTickModified: Date | null; syncedAt: Date | null; updatedAt: Date; isRecurring: boolean;
}): LocalTask {
  return {
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    tickTickModified: t.tickTickModified?.toISOString() ?? null,
    syncedAt: t.syncedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  };
}

async function applyAction(a: SyncAction, userId: string, projectIdByList: Record<ListName, string>): Promise<void> {
  switch (a.kind) {
    case "pullCreate":
      await prisma.todoTask.create({
        data: {
          ...remoteToLocalFields(a.remote), status: "pending", source: "ticktick",
          type: a.remote.listName === "Financeiro" ? "financial" : "general", userId, ...remoteSyncFields(a.remote),
        },
      });
      return;
    case "pullUpdate":
    case "link":
      await prisma.todoTask.update({
        where: { id: a.localId },
        data: { ...(a.kind === "pullUpdate" ? remoteToLocalFields(a.remote) : {}), ...remoteSyncFields(a.remote) },
      });
      return;
    case "pushCreate": {
      const created = await createTask(localToTickTickPayload({ ...a.local, dueDate: a.local.dueDate ? new Date(a.local.dueDate) : null, tickTickId: null }, projectIdByList[a.listName]));
      await prisma.todoTask.update({
        where: { id: a.local.id },
        data: { listName: a.listName, ...remoteSyncFields(toRemoteTask(created, a.listName)) },
      });
      return;
    }
    case "pushUpdate": {
      const projectId = projectIdByList[a.listName];
      const base = { ...a.local, dueDate: a.local.dueDate ? new Date(a.local.dueDate) : null };
      let saved;
      if (a.moveFromProjectId && a.local.tickTickId) {
        saved = await createTask(localToTickTickPayload({ ...base, tickTickId: null }, projectId));
        await deleteTask(a.moveFromProjectId, a.local.tickTickId).catch((e) => { if (!(e instanceof TickTickNotFoundError)) throw e; });
      } else {
        saved = await updateTask(a.local.tickTickId!, localToTickTickPayload(base, projectId));
      }
      await prisma.todoTask.update({ where: { id: a.local.id }, data: remoteSyncFields(toRemoteTask(saved, a.listName)) });
      return;
    }
    case "pushComplete": {
      await completeTask(a.local.tickTickProjectId!, a.local.tickTickId!);
      if (a.local.isRecurring) {
        // TickTick avança a data da recorrente: volta a pendente com a nova data.
        const next = await getTask(a.local.tickTickProjectId!, a.local.tickTickId!);
        if (next.status !== 2) {
          const list = (a.local.listName as ListName) ?? "Work";
          const r = toRemoteTask(next, list);
          await prisma.todoTask.update({
            where: { id: a.local.id },
            data: { ...remoteToLocalFields(r), status: "pending", completedAt: null, ...remoteSyncFields(r) },
          });
          return;
        }
      }
      await prisma.todoTask.update({ where: { id: a.local.id }, data: { tickTickId: null, syncedAt: new Date() } });
      return;
    }
    case "pushDelete":
      await deleteTask(a.local.tickTickProjectId!, a.local.tickTickId!).catch((e) => { if (!(e instanceof TickTickNotFoundError)) throw e; });
      await prisma.todoTask.update({ where: { id: a.local.id }, data: { tickTickId: null, tickTickProjectId: null, syncedAt: new Date() } });
      return;
    case "checkMissing": {
      try {
        const remote = await getTask(a.local.tickTickProjectId!, a.local.tickTickId!);
        if (remote.status === 2) {
          await prisma.todoTask.update({
            where: { id: a.local.id },
            data: { status: "done", completedAt: remote.modifiedTime ? new Date(parseTickTickDate(remote.modifiedTime)!) : new Date(), tickTickId: null, syncedAt: new Date() },
          });
          return;
        }
        // Aberta mas fora das listas sincronizadas (movida para Pessoal etc.).
      } catch (e) {
        if (!(e instanceof TickTickNotFoundError)) throw e;
      }
      await prisma.todoTask.update({
        where: { id: a.local.id },
        data: { status: "cancelled", tickTickId: null, tickTickProjectId: null, syncedAt: new Date(), description: `${a.local.description ?? ""}\n[Saiu das listas sincronizadas do TickTick]`.trim() },
      });
      return;
    }
  }
}

const actionTitle = (a: SyncAction) => ("remote" in a ? a.remote.title : a.local.title);

export async function runTickTickSync(opts: { dryRun?: boolean } = {}): Promise<SyncSummary> {
  const counts = emptyCounts();
  if (!(await claimLock())) return { ok: true, skipped: "running", counts };
  try {
    const user = await getDefaultUser();
    const projects = await listSyncedProjects();
    const projectIdByList = Object.fromEntries(projects.map((p) => [p.listName, p.id])) as Record<ListName, string>;
    const remotes = (await Promise.all(projects.map((p) => listOpenTasks(p.id, p.listName)))).flat();
    const rows = await prisma.todoTask.findMany({
      where: { userId: user.id, OR: [{ tickTickId: { not: null } }, { status: { in: ["pending", "waiting"] } }] },
    });
    const actions = planSync(rows.map(toLocalTask), remotes, projectIdByList);
    for (const a of actions) counts[a.kind]++;

    if (opts.dryRun) {
      return { ok: true, counts, actions: actions.map((a) => ({ kind: a.kind, title: actionTitle(a) })) };
    }

    const errors: string[] = [];
    for (const a of actions) {
      try {
        await applyAction(a, user.id, projectIdByList);
      } catch (e) {
        if (e instanceof TickTickAuthError) throw e;
        errors.push(`${a.kind} "${actionTitle(a)}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await prisma.tickTickSyncState.update({
      where: { id: STATE_ID },
      data: { lastOkAt: errors.length ? undefined : new Date(), lastError: errors.length ? errors.slice(0, 5).join(" | ") : null, authBroken: false },
    });
    return { ok: errors.length === 0, error: errors[0], counts };
  } catch (e) {
    const authBroken = e instanceof TickTickAuthError;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ticktick/sync]", e);
    await prisma.tickTickSyncState.update({ where: { id: STATE_ID }, data: { lastError: msg, authBroken } });
    return { ok: false, authBroken, error: msg, counts };
  } finally {
    await prisma.tickTickSyncState.update({ where: { id: STATE_ID }, data: { runningSince: null } });
  }
}

export async function getSyncStatus() {
  const s = await prisma.tickTickSyncState.findUnique({ where: { id: STATE_ID } });
  return {
    lastOkAt: s?.lastOkAt?.toISOString() ?? null,
    lastRunAt: s?.lastRunAt?.toISOString() ?? null,
    lastError: s?.lastError ?? null,
    authBroken: s?.authBroken ?? false,
  };
}

export async function deleteRemoteFor(taskId: string): Promise<void> {
  const t = await prisma.todoTask.findUnique({ where: { id: taskId }, select: { tickTickId: true, tickTickProjectId: true } });
  if (!t?.tickTickId || !t.tickTickProjectId) return;
  await deleteTask(t.tickTickProjectId, t.tickTickId).catch((e) => { if (!(e instanceof TickTickNotFoundError)) throw e; });
}
```

- [ ] **Step 2: Rota de sincronização**

Criar `src/app/api/agenda/sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSyncStatus, runTickTickSync } from "@/lib/ticktick/syncRunner";

export const maxDuration = 120;

export async function GET() {
  return NextResponse.json(await getSyncStatus());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await runTickTickSync({ dryRun: body?.dryRun === true }));
}
```

(Rota fica sob o Basic Auth do painel; não liberar no `proxy.ts`.)

- [ ] **Step 3: Gatilhos nas rotas de tarefas**

Em `src/app/api/tarefas/route.ts`:
1. Imports: `import { after } from "next/server";` (adicionar ao import existente de `next/server`) e `import { runTickTickSync } from "@/lib/ticktick/syncRunner";`.
2. No `POST`, dentro de `data` do `create`, adicionar:

```ts
        allDay:      body.allDay   ?? true,
        listName:    body.listName || null,
```

e trocar `dueDate:     body.dueDate ? new Date(body.dueDate) : null,` por
`dueDate:     body.dueDate ? new Date(body.dueDate.length === 10 ? `${body.dueDate}T00:00:00.000Z` : body.dueDate) : null,`.
3. Antes do `return NextResponse.json(task);` do POST: `after(() => runTickTickSync().then(() => undefined));`

Em `src/app/api/tarefas/[id]/route.ts`:
1. Mesmos imports, mais `deleteRemoteFor`.
2. No `PATCH`, dentro de `data`, adicionar
`...(body.allDay !== undefined && { allDay: body.allDay }),` e
`...(body.listName !== undefined && { listName: body.listName || null }),` e aplicar a mesma regra de `dueDate` de 10 caracteres.
3. Antes do `return` do PATCH: `after(() => runTickTickSync().then(() => undefined));`
4. No `DELETE`, antes de `prisma.todoTask.delete`: `await deleteRemoteFor(id).catch((e) => console.error("[tarefas/delete] ticktick", e));`

- [ ] **Step 4: Cron da manhã**

Em `src/app/api/cron/jarvis/route.ts`, importar `runTickTickSync` e, dentro do `try`, logo depois de `const user = await getDefaultUser();`:

```ts
    if (slot === "morning") {
      await runTickTickSync().catch((e) => console.error("[cron/jarvis] ticktick sync", e));
    }
```

- [ ] **Step 5: Checar e commitar**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: sem erros novos. **Não** chamar `runTickTickSync` contra produção nesta task.

```bash
git add src/lib/ticktick/syncRunner.ts src/app/api/agenda/sync/route.ts src/app/api/tarefas src/app/api/cron/jarvis/route.ts
git commit -m "feat(agenda): sync runner, sync route and write triggers"
```

---

### Task 6: Visões da agenda (puro) e rota de itens

**Files:**
- Create: `src/lib/agenda/views.ts`, `src/lib/agenda/views.test.ts`
- Create: `src/app/api/agenda/items/route.ts`

**Interfaces:**
- Consumes: `saoPauloDay` (Task 2), `normalizePriority` (Task 2), `listEvents` + `GoogleEvent` (`@/lib/google-calendar`).
- Produces:

```ts
export type AgendaTask = { kind: "task"; id: string; title: string; description: string | null; day: string | null; time: string | null; allDay: boolean; priority: "alta" | "media" | "baixa" | "nenhuma"; listName: string | null; isRecurring: boolean; status: string };
export type AgendaEvent = { kind: "event"; id: string; title: string; day: string; time: string | null; endTime: string | null; color: string | null; htmlLink: string | null };
export type AgendaItem = AgendaTask | AgendaEvent;
export function taskFromRow(row: { id; title; description; dueDate: Date | string | null; allDay; priority; listName; isRecurring; status }): AgendaTask;
export function eventFromGoogle(e: GoogleEvent): AgendaEvent;
export function todayView(items: AgendaItem[], today: string): { overdue: AgendaTask[]; today: AgendaItem[]; noDate: AgendaTask[] };
export function weekView(items: AgendaItem[], today: string): { day: string; items: AgendaItem[] }[]; // 7 dias
export function monthGrid(items: AgendaItem[], year: number, month: number): { day: string; inMonth: boolean; items: AgendaItem[] }[]; // 42 células, semana começa no domingo
export function weekGrid(items: AgendaItem[], weekStart: string): { day: string; allDay: AgendaItem[]; timed: AgendaItem[] }[];
export function matrixView(items: AgendaItem[]): Record<"q1" | "q2" | "q3" | "q4", AgendaTask[]>;
export function sortItems(items: AgendaItem[]): AgendaItem[]; // dia inteiro primeiro, depois por horário, depois prioridade
```

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/agenda/views.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { taskFromRow, eventFromGoogle, todayView, weekView, monthGrid, weekGrid, matrixView, sortItems, type AgendaTask } from "./views";

const row = (p: Record<string, unknown>) => ({
  id: "t", title: "x", description: null, dueDate: null, allDay: true, priority: "media",
  listName: "Work", isRecurring: false, status: "pending", ...p,
});

describe("conversões", () => {
  it("tarefa de dia inteiro usa o dia da data; com horário usa SP", () => {
    expect(taskFromRow(row({ dueDate: new Date("2026-10-16T00:00:00.000Z") }))).toMatchObject({ day: "2026-10-16", time: null, allDay: true });
    expect(taskFromRow(row({ dueDate: "2026-10-16T17:30:00.000Z", allDay: false }))).toMatchObject({ day: "2026-10-16", time: "14:30" });
    expect(taskFromRow(row({ priority: "high" })).priority).toBe("alta");
  });
  it("evento do Google com e sem horário", () => {
    expect(eventFromGoogle({ id: "e", summary: "Call", start: { dateTime: "2026-10-16T13:00:00-03:00" }, end: { dateTime: "2026-10-16T14:00:00-03:00" } }))
      .toMatchObject({ day: "2026-10-16", time: "13:00", endTime: "14:00" });
    expect(eventFromGoogle({ id: "e", summary: "Feriado", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } }))
      .toMatchObject({ day: "2026-10-12", time: null });
  });
});

describe("visões", () => {
  const items = [
    taskFromRow(row({ id: "late", dueDate: new Date("2026-10-14T00:00:00.000Z") })),
    taskFromRow(row({ id: "today-timed", dueDate: "2026-10-16T18:00:00.000Z", allDay: false })),
    taskFromRow(row({ id: "today-allday", dueDate: new Date("2026-10-16T00:00:00.000Z"), priority: "alta" })),
    taskFromRow(row({ id: "nodate", priority: "nenhuma" })),
    taskFromRow(row({ id: "next", dueDate: new Date("2026-10-20T00:00:00.000Z"), priority: "baixa" })),
    eventFromGoogle({ id: "ev", summary: "Call", start: { dateTime: "2026-10-16T10:00:00-03:00" }, end: { dateTime: "2026-10-16T11:00:00-03:00" } }),
  ];

  it("Hoje: atrasadas separadas, dia ordenado (dia inteiro primeiro), sem data à parte", () => {
    const v = todayView(items, "2026-10-16");
    expect(v.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(v.today.map((t) => t.id)).toEqual(["today-allday", "ev", "today-timed"]);
    expect(v.noDate.map((t) => t.id)).toEqual(["nodate"]);
  });

  it("7 dias começa hoje e tem 7 colunas", () => {
    const w = weekView(items, "2026-10-16");
    expect(w).toHaveLength(7);
    expect(w[0].day).toBe("2026-10-16");
    expect(w[4]).toMatchObject({ day: "2026-10-20" });
    expect(w[4].items.map((i) => i.id)).toEqual(["next"]);
  });

  it("mês: 42 células, domingo primeiro", () => {
    const g = monthGrid(items, 2026, 10);
    expect(g).toHaveLength(42);
    expect(g[0]).toMatchObject({ day: "2026-09-27", inMonth: false });
    expect(g.find((c) => c.day === "2026-10-16")!.items).toHaveLength(3);
  });

  it("semana: dia inteiro separado dos com horário", () => {
    const g = weekGrid(items, "2026-10-11");
    const fri = g.find((d) => d.day === "2026-10-16")!;
    expect(fri.allDay.map((i) => i.id)).toEqual(["today-allday"]);
    expect(fri.timed.map((i) => i.id)).toEqual(["ev", "today-timed"]);
  });

  it("matriz pela prioridade, só tarefas", () => {
    const m = matrixView(items);
    expect(m.q1.map((t) => t.id)).toEqual(["today-allday"]);
    expect(m.q3.map((t) => t.id)).toEqual(["next"]);
    expect(m.q4.map((t) => t.id)).toEqual(["nodate"]);
    expect(m.q2.map((t: AgendaTask) => t.id).sort()).toEqual(["late", "today-timed"]);
  });

  it("sortItems: dia inteiro, depois horário, depois prioridade", () => {
    expect(sortItems(items.slice(1, 3)).map((i) => i.id)).toEqual(["today-allday", "today-timed"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/agenda/views.test.ts`
Expected: FAIL ("Failed to resolve import ./views").

- [ ] **Step 3: Implementar `views.ts`**

Criar `src/lib/agenda/views.ts`:

```ts
// Itens da agenda (tarefas + eventos do Google) e as 4 visões. Puro.

import type { GoogleEvent } from "@/lib/google-calendar";
import { normalizePriority, saoPauloDay } from "@/lib/ticktick/mapping";

export type AgendaTask = {
  kind: "task"; id: string; title: string; description: string | null; day: string | null; time: string | null;
  allDay: boolean; priority: "alta" | "media" | "baixa" | "nenhuma"; listName: string | null; isRecurring: boolean; status: string;
};
export type AgendaEvent = {
  kind: "event"; id: string; title: string; day: string; time: string | null; endTime: string | null;
  color: string | null; htmlLink: string | null;
};
export type AgendaItem = AgendaTask | AgendaEvent;

const TZ = "America/Sao_Paulo";
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

export function taskFromRow(row: {
  id: string; title: string; description: string | null; dueDate: Date | string | null; allDay: boolean;
  priority: string; listName: string | null; isRecurring: boolean; status: string;
}): AgendaTask {
  const d = row.dueDate ? new Date(row.dueDate) : null;
  return {
    kind: "task",
    id: row.id,
    title: row.title,
    description: row.description,
    day: d ? (row.allDay ? d.toISOString().slice(0, 10) : saoPauloDay(d)) : null,
    time: d && !row.allDay ? hhmm(d) : null,
    allDay: row.allDay,
    priority: normalizePriority(row.priority),
    listName: row.listName,
    isRecurring: row.isRecurring,
    status: row.status,
  };
}

export function eventFromGoogle(e: GoogleEvent): AgendaEvent {
  const start = e.start.dateTime ? new Date(e.start.dateTime) : null;
  const end = e.end.dateTime ? new Date(e.end.dateTime) : null;
  return {
    kind: "event",
    id: e.id,
    title: e.summary,
    day: start ? saoPauloDay(start) : (e.start.date ?? ""),
    time: start ? hhmm(start) : null,
    endTime: end ? hhmm(end) : null,
    color: e.colorId ?? null,
    htmlLink: e.htmlLink ?? null,
  };
}

const PRIO = { alta: 0, media: 1, baixa: 2, nenhuma: 3 } as const;

export function sortItems(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    const at = a.time ?? "", bt = b.time ?? "";
    if (!at !== !bt) return at ? 1 : -1; // dia inteiro primeiro
    if (at !== bt) return at.localeCompare(bt);
    const ap = a.kind === "task" ? PRIO[a.priority] : 1;
    const bp = b.kind === "task" ? PRIO[b.priority] : 1;
    return ap - bp;
  });
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const onDay = (items: AgendaItem[], day: string) => sortItems(items.filter((i) => i.day === day));

export function todayView(items: AgendaItem[], today: string) {
  const tasks = items.filter((i): i is AgendaTask => i.kind === "task");
  return {
    overdue: sortItems(tasks.filter((t) => t.day && t.day < today)) as AgendaTask[],
    today: onDay(items, today),
    noDate: tasks.filter((t) => !t.day),
  };
}

export function weekView(items: AgendaItem[], today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i);
    return { day, items: onDay(items, day) };
  });
}

export function monthGrid(items: AgendaItem[], year: number, month: number) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const dow = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i);
    return { day, inMonth: day.slice(0, 7) === first.slice(0, 7), items: onDay(items, day) };
  });
}

export function weekGrid(items: AgendaItem[], weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const all = onDay(items, day);
    return { day, allDay: all.filter((x) => !x.time), timed: all.filter((x) => x.time) };
  });
}

export function matrixView(items: AgendaItem[]) {
  const tasks = sortItems(items.filter((i) => i.kind === "task")) as AgendaTask[];
  return {
    q1: tasks.filter((t) => t.priority === "alta"),
    q2: tasks.filter((t) => t.priority === "media"),
    q3: tasks.filter((t) => t.priority === "baixa"),
    q4: tasks.filter((t) => t.priority === "nenhuma"),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/agenda/views.test.ts`
Expected: PASS. Se o caso de ordenação falhar por causa de evento sem prioridade, ajuste só `sortItems` mantendo a regra "dia inteiro → horário → prioridade".

- [ ] **Step 5: Rota de itens**

Criar `src/app/api/agenda/items/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { listEvents } from "@/lib/google-calendar";
import { eventFromGoogle, taskFromRow, type AgendaItem } from "@/lib/agenda/views";
import { getSyncStatus } from "@/lib/ticktick/syncRunner";

// Todas as tarefas abertas (volume pequeno, dono único) + eventos do Google no intervalo pedido.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from/to obrigatórios (YYYY-MM-DD)" }, { status: 400 });
  }
  const user = await getDefaultUser();
  const [rows, events, sync] = await Promise.all([
    prisma.todoTask.findMany({ where: { userId: user.id, status: { in: ["pending", "waiting"] } } }),
    listEvents(`${from}T00:00:00-03:00`, `${to}T23:59:59-03:00`).catch((e) => {
      console.error("[agenda/items] google", e);
      return [];
    }),
    getSyncStatus(),
  ]);
  const items: AgendaItem[] = [...rows.map(taskFromRow), ...events.map(eventFromGoogle)];
  return NextResponse.json({ items, sync });
}
```

- [ ] **Step 6: Checar e commitar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros.

```bash
git add src/lib/agenda src/app/api/agenda/items/route.ts
git commit -m "feat(agenda): pure views and items endpoint"
```

---

### Task 7: Tela da Agenda

**Files:**
- Rewrite: `src/app/(dashboard)/agenda/page.tsx`
- Create: `src/app/(dashboard)/agenda/components/{SyncBadge,TaskRow,TaskForm,TodayView,WeekView,CalendarView,MatrixView,GooglePanel}.tsx`

**Interfaces:**
- Consumes: `GET /api/agenda/items`, `POST /api/agenda/sync`, `POST/PATCH /api/tarefas[...]` (campos `allDay`, `listName`, `priority` incl. `"nenhuma"`, `dueDate` `YYYY-MM-DD` ou ISO), rotas Google existentes (`/api/agenda/google`, `/api/agenda/eventos`), funções de `@/lib/agenda/views`.
- Produces: a página.

Esta task é de integração com UI; o implementador escreve os componentes seguindo os contratos abaixo. Antes de começar, **leia a página atual inteira** (`agenda/page.tsx`, 520 linhas).

- [ ] **Step 1: Mover a parte do Google para `GooglePanel.tsx`**

Mover da página atual, **sem mudar o comportamento**: estado e handlers de conexão (`connected`, `authUrl`, desconectar, notificação de `?google=...` na URL), o formulário "Novo Evento" (com vínculo de aluno e criação de follow-up) e o apagar evento. `GooglePanel` recebe `{ onChanged: () => void }`, renderiza um botão "+ Evento" (abre o modal existente) e o estado de conexão (conectar/desconectar). As constantes `GCOLOR`/`COLOR_OPTIONS` vão junto.

- [ ] **Step 2: Componentes de tarefa**

- `SyncBadge({ sync, syncing, onSync })`: mostra "Sincronizando…" / "TickTick sincronizado há N min" (de `lastOkAt`) / em vermelho "Reconectar TickTick" quando `authBroken` (com `title` explicando: rodar `ticktick-auth-setup.js` na ponte do Jarvis e atualizar `TICKTICK_ACCESS_TOKEN` na Vercel) / "Erro ao sincronizar" com `lastError` no `title`. Clique roda `onSync`.
- `TaskRow({ item, onToggle, onOpen })`: círculo de concluir (cor da prioridade: alta `#E91E90`, média `#f59e0b`, baixa `#3b82f6`, nenhuma `#9ca3af`), título, chip da lista (Work/Financeiro/Estudos), hora ou "dia todo", ícone `Repeat` (lucide) se `isRecurring`. `AgendaEvent` renderiza com faixa da cor do Google, horário e link "abrir no Google"; sem círculo.
- `TaskForm({ initial?, onClose, onSaved })`: campos título, descrição, data (`type="date"`), "dia todo" (checkbox) e hora (`type="time"`, só se não for dia todo), prioridade (Alta/Média/Baixa/Nenhuma), lista (Work/Financeiro/Estudos). Salvar: `POST /api/tarefas` (nova) ou `PATCH /api/tarefas/:id` com `{ title, description, priority, listName, allDay, dueDate }`, onde `dueDate` é `"YYYY-MM-DD"` se dia todo, senão ISO de `${data}T${hora}:00-03:00`. Botão "Excluir" na edição chama `DELETE /api/tarefas/:id` após confirmação **inline** (sem `window.confirm`).

- [ ] **Step 3: As 4 visões**

Cada visão recebe `{ items: AgendaItem[], today: string, onToggle, onOpen }` e usa as funções puras:
- `TodayView`: seção "Atrasadas" (vermelho, só se houver), "Hoje", "Sem data" (recolhida por padrão).
- `WeekView`: 7 blocos (hoje → +6) com título "Sex, 16/10"; em telas largas, 7 colunas; no celular, lista.
- `CalendarView`: alternador Mês/Semana + navegação ‹ ›. Mês: `monthGrid` (até 3 itens por célula + "+N"); clicar no dia mostra a lista do dia abaixo. Semana: `weekGrid`, faixa "dia todo" no topo e lista por horário.
- `MatrixView`: 4 quadrantes 2×2 com títulos "Urgente e importante", "Importante, não urgente", "Urgente, não importante", "Nem urgente nem importante"; cores de borda alinhadas às prioridades.

- [ ] **Step 4: Página**

`page.tsx` (client): estado `tab` (`"hoje" | "semana" | "calendario" | "matriz"`, persistido em `localStorage` com try/catch), `items`, `sync`, `syncing`, `formTask`.
- Ao montar: `POST /api/agenda/sync` (mostra "Sincronizando…"), depois carrega itens.
- Carregar itens: `GET /api/agenda/items?from=<hoje-35d>&to=<hoje+70d>` (cobre mês anterior/seguinte do calendário).
- Concluir: atualização otimista (remove da lista) + `PATCH /api/tarefas/:id { status: "done" }`; se falhar, recarrega e mostra aviso.
- Cabeçalho: título "Agenda" (DM Serif Display), `SyncBadge`, botões "+ Tarefa" (abre `TaskForm`) e o `GooglePanel`.
- Abas com acento `#E91E90` na ativa. Layout responsivo (funciona no celular).

- [ ] **Step 5: Ver funcionando localmente (sem gravar)**

Rodar `npm run dev` com o Basic Auth local (`.env.local` já tem `BASIC_AUTH_USER=localdev`/`BASIC_AUTH_PASSWORD=localdev123`). **Antes** de abrir `/agenda`, defina `TICKTICK_ACCESS_TOKEN=` vazio no ambiente do dev server para a sincronização falhar com "Reconectar TickTick" em vez de gravar em produção. Conferir: as 4 abas renderizam com as tarefas abertas atuais e os eventos do Google; nenhum erro no console; layout ok a 375 px de largura. Tirar prints (Playwright em pasta temporária, como já foi feito no projeto) e anexar ao relatório.

- [ ] **Step 6: Checar e commitar**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: sem erros novos.

```bash
git add "src/app/(dashboard)/agenda"
git commit -m "feat(agenda): TickTick-style views with tasks and Google events"
```

---

### Task 8: Primeira sincronização e verificação com o Fernando

Grava nos dois lados (sistema e TickTick). **Cada passo que grava precisa do "pode" do Fernando.**

- [ ] **Step 1: Token na Vercel** — com ok, copiar `TICKTICK_ACCESS_TOKEN` do `.env` da ponte (`/Users/fernandogomes/Desktop/FGT/07_PROJETOS/FGT-Jarvis-Bridge/.env`) para a Vercel (production) sem exibir o valor, e para o `.env.local` do sistema.
- [ ] **Step 2: Deploy** — integrar a branch (superpowers:finishing-a-development-branch), push, esperar a Vercel ficar Ready.
- [ ] **Step 3: Simulação** — chamar `POST /api/agenda/sync` com `{ "dryRun": true }` (com Basic Auth de produção) e mostrar ao Fernando a lista de ações e contagens (esperado: ~37 `pullCreate` das listas Work/Estudos e ~1 `pushCreate`/`link` da tarefa pendente do sistema). Só seguir com o ok dele.
- [ ] **Step 4: Sincronizar de verdade** — `POST /api/agenda/sync` sem dryRun; conferir contagens e que nenhuma tarefa de Pessoal/Fitness/Brainstorm entrou.
- [ ] **Step 5: Roteiro ao vivo** — pedir ao Fernando:
  1. criar no TickTick (Work) "teste agenda" → abrir a Agenda → aparece;
  2. concluir pela Agenda → some no TickTick;
  3. criar pela Agenda na lista Estudos com horário → aparece no TickTick na hora certa;
  4. concluir uma recorrente pela Agenda → volta com a próxima data nos dois lados;
  5. mandar no Telegram "criar tarefa: revisar contrato amanhã" → aparece no TickTick (Work) após abrir a Agenda.
- [ ] **Step 6: Registrar** — atualizar a memória `project_agenda_ticktick.md` com o resultado e o que ficou para o Plano B.

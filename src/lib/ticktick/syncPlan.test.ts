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
      [local({ id: "l1", tickTickId: "r1", tickTickProjectId: "pw", syncedAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T10:00:00.000Z", tickTickModified: "2026-10-16T09:00:00.000Z" })],
      [remote({ id: "r1", modifiedTime: "2026-10-16T09:00:00.000Z" })],
      PROJ,
    );
    expect(acts).toEqual([]);
  });

  it("só o remoto mudou → pullUpdate; só o local → pushUpdate", () => {
    const base = { tickTickId: "r1", tickTickProjectId: "pw", syncedAt: "2026-10-16T10:00:00.000Z", tickTickModified: "2026-10-16T09:00:00.000Z", listName: "Work" };
    expect(kinds(planSync([local({ id: "l1", ...base, updatedAt: "2026-10-16T10:00:00.000Z" })], [remote({ id: "r1", modifiedTime: "2026-10-16T11:00:00.000Z" })], PROJ))).toEqual(["pullUpdate"]);
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

const linked = (p: Partial<LocalTask> = {}) => local({ id: "l1", tickTickId: "r1", tickTickProjectId: "pw", listName: "Work", syncedAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T10:00:00.000Z", tickTickModified: "2026-10-16T09:00:00.000Z", ...p });
const unchanged = (p: Partial<RemoteTask> = {}) => remote({ id: "r1", modifiedTime: "2026-10-16T09:00:00.000Z", ...p });
describe("regression boundaries", () => {
  it.each([1, 4999, 5000, 5001])("preserves actual edits at %i ms", (ms) => {
    expect(kinds(planSync([linked({title: "edited", updatedAt: new Date(Date.parse("2026-10-16T10:00:00Z") + ms).toISOString()})], [unchanged()], PROJ))).toEqual(["pushUpdate"]);
  });
  it("ignores atomically acknowledged sync writes", () => {
    expect(planSync([linked()], [unchanged()], PROJ)).toEqual([]);
  });
  it("resolves conflicting edits within slack by most recent instant", () => {
    expect(kinds(planSync([linked({title: "local edit", updatedAt: "2026-10-16T10:00:04Z"})], [unchanged({title: "remote edit", modifiedTime: "2026-10-16T10:00:03Z"})], PROJ))).toEqual(["pushUpdate"]);
    expect(kinds(planSync([linked({title: "local edit", updatedAt: "2026-10-16T10:00:03Z"})], [unchanged({title: "remote edit", modifiedTime: "2026-10-16T10:00:04Z"})], PROJ))).toEqual(["pullUpdate"]);
  });
  it("does not link identical titles across lists", () => {
    expect(kinds(planSync([local({id: "l1", listName: "Estudos"})], [remote({id: "r1"})], PROJ)).sort()).toEqual(["pullCreate", "pushCreate"]);
  });
  it("does not link different times on the same day", () => {
    expect(kinds(planSync([local({id: "l1", allDay: false, dueDate: "2026-10-16T12:00:00Z"})], [remote({id: "r1", isAllDay: false, dueDate: "2026-10-16T13:00:00Z"})], PROJ)).sort()).toEqual(["pullCreate", "pushCreate"]);
  });
  it("links equivalent timed instants with different offsets", () => {
    expect(kinds(planSync([local({id: "l1", allDay: false, dueDate: "2026-10-16T09:00:00-03:00"})], [remote({id: "r1", isAllDay: false, dueDate: "2026-10-16T12:00:00Z"})], PROJ))).toEqual(["link"]);
  });
  it("does not link all-day and timed tasks", () => {
    expect(kinds(planSync([local({id: "l1", dueDate: "2026-10-16T00:00:00Z"})], [remote({id: "r1", isAllDay: false, dueDate: "2026-10-16T12:00:00Z"})], PROJ)).sort()).toEqual(["pullCreate", "pushCreate"]);
  });
  it("never imports unapproved or misidentified remote lists", () => {
    expect(planSync([], [remote({id: "r1", listName: "Pessoal" as RemoteTask["listName"]}), remote({id: "r2", projectId: "personal-project"})], PROJ)).toEqual([]);
  });
  it("never exports an explicitly unapproved list", () => {
    expect(planSync([local({id: "l1", listName: "Pessoal"})], [], PROJ)).toEqual([]);
    expect(planSync([linked({listName: "Brainstorm", status: "done"})], [unchanged()], PROJ)).toEqual([]);
  });
  it("supports waiting and in-progress tasks without losing open work", () => {
    expect(kinds(planSync([local({id: "l1", status: "in_progress"})], [], PROJ))).toEqual(["pushCreate"]);
    expect(kinds(planSync([local({id: "l1", status: "waiting"})], [], PROJ))).toEqual(["pushCreate"]);
  });
  it("checks a missing completed recurring task for its next occurrence", () => {
    expect(kinds(planSync([linked({status: "done", isRecurring: true})], [], PROJ))).toEqual(["checkMissing"]);
  });
});

it("pulls the next occurrence after an acknowledged completion", () => {
 expect(kinds(planSync([linked({status: "done", isRecurring: true})], [unchanged({dueDate: "2026-10-20T03:00:00Z", isRecurring: true})], PROJ))).toEqual(["pullUpdate"]);
});
it("pushes a genuinely dirty completion", () => {
 expect(kinds(planSync([linked({status: "done", updatedAt: "2026-10-16T10:00:00.001Z"})], [unchanged()], PROJ))).toEqual(["pushComplete"]);
});
it("strictly detects post-acknowledgment edits even when fields currently agree", () => {
 expect(kinds(planSync([linked({updatedAt: "2026-10-16T10:00:00.001Z"})], [unchanged()], PROJ))).toEqual(["pushUpdate"]);
});

it.each(["2026-10-16T10:00:00.000Z", "2026-10-16T11:00:00.000Z"])("pulls a remote reopening after completion acknowledged at %s", syncedAt => {
  expect(kinds(planSync([linked({status: "done", syncedAt})], [unchanged()], PROJ))).toEqual(["pullUpdate"]);
});
it("does not re-complete an acknowledged next occurrence across sync cycles", () => {
  const next = unchanged({dueDate: "2026-10-20T03:00:00Z", isRecurring: true});
  expect(kinds(planSync([linked({status: "done", isRecurring: true})], [next], PROJ))).toEqual(["pullUpdate"]);
  expect(planSync([linked({status: "pending", isRecurring: true, dueDate: "2026-10-20T00:00:00Z"})], [next], PROJ)).toEqual([]);
});
it("does not treat metadata older than acknowledgment as a local edit", () => {
  expect(planSync([linked({updatedAt: "2026-10-16T09:59:59Z"})], [unchanged()], PROJ)).toEqual([]);
});
it("never looks up or writes to an unapproved project in extra map keys", () => {
  const projects = {...PROJ, Pessoal: "personal-project"};
  expect(planSync([linked({tickTickProjectId: "personal-project"})], [], projects)).toEqual([]);
});
it("never syncs linked tasks in disallowed lists for any status", () => {
  for (const status of ["pending", "done", "cancelled", "waiting"]) {
    expect(planSync([linked({status, listName: "Pessoal"})], [unchanged()], PROJ)).toEqual([]);
  }
});

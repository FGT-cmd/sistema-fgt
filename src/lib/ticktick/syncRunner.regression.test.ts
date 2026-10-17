import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TickTickApiTask } from "./types";
import { toRemoteTask } from "./mapping";

const io = vi.hoisted(() => ({
  state: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  task: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  user: vi.fn(), projects: vi.fn(), open: vi.fn(), get: vi.fn(), create: vi.fn(),
  update: vi.fn(), complete: vi.fn(), move: vi.fn(), del: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { tickTickSyncState: io.state, todoTask: io.task, user: { findUnique: io.user } } }));
vi.mock("./client", () => ({
  TickTickAuthError: class extends Error {}, TickTickNotFoundError: class extends Error {},
  listSyncedProjects: io.projects, listOpenTasks: io.open, getTask: io.get,
  createTask: io.create, updateTask: io.update, completeTask: io.complete, moveTask: io.move, deleteTask: io.del,
}));
import { getSyncStatus, runTickTickSync } from "./syncRunner";

const baseline = new Date("2026-10-16T09:00:00Z");
const revisionA = new Date("2026-10-16T10:00:00Z");
const revisionB = new Date("2026-10-16T10:00:01Z");
const commitA = "2026-10-16T10:00:02.000Z";
const makeRow = () => ({
  id: "local", userId: "owner", title: "Task A", description: "local description", dueDate: new Date("2026-10-17T15:00:00Z") as Date | null,
  allDay: false, priority: "media", status: "pending", type: "general", listName: "Work",
  tickTickId: "remote" as string | null, tickTickProjectId: "w" as string | null,
  tickTickEtag: "v1" as string | null, tickTickModified: baseline as Date | null,
  syncedAt: baseline as Date | null, updatedAt: revisionA, completedAt: null as Date | null, isRecurring: false,
});
type Row = ReturnType<typeof makeRow>;
let rows: Row[];
let remotes: TickTickApiTask[];
let state: Record<string, unknown>;
let beforeWrite: (() => void) | undefined;
const same = (a: unknown, b: unknown) => a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
const matches = (r: object, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => same((r as Record<string, unknown>)[key], value));
const snapshot = <T,>(value: T): T => structuredClone(value);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TICKTICK_SYNC_ENABLED", "true");
  vi.stubEnv("TICKTICK_ACCESS_TOKEN", "mock");
  rows = [makeRow()];
  remotes = [{ id: "remote", projectId: "w", title: "Task old", content: "old description", priority: 3,
    dueDate: "2026-10-17T15:00:00.000+0000", startDate: "2026-10-17T14:00:00.000+0000", isAllDay: false,
    status: 0, etag: "v1", modifiedTime: baseline.toISOString() }];
  state = { lockToken: null, runningSince: null };
  beforeWrite = undefined;
  io.user.mockResolvedValue({ id: "owner" });
  io.projects.mockResolvedValue([{ id: "w", listName: "Work" }, { id: "f", listName: "Financeiro" }, { id: "e", listName: "Estudos" }]);
  io.state.findUnique.mockImplementation(async () => snapshot(state));
  io.state.updateMany.mockImplementation(async ({ where, data }) => {
    if (!matches({ id: "main", ...state }, where)) return { count: 0 };
    Object.assign(state, data); return { count: 1 };
  });
  io.task.findMany.mockImplementation(async () => snapshot(rows));
  io.task.findFirst.mockImplementation(async ({ where }) => snapshot(rows.find(r => matches(r, where)) ?? null));
  io.task.updateMany.mockImplementation(async ({ where, data }) => {
    const hook = beforeWrite; beforeWrite = undefined; hook?.();
    const row = rows.find(r => matches(r, where));
    if (!row) return { count: 0 };
    // Model Prisma's @updatedAt so metadata-only updates cannot silently dirty/ack revisions.
    Object.assign(row, { updatedAt: new Date() }, data); return { count: 1 };
  });
  io.open.mockImplementation(async (projectId, listName) => remotes.filter(r => r.projectId === projectId && r.status === 0).map(r => toRemoteTask(snapshot(r), listName)));
  io.get.mockImplementation(async (_projectId, id) => snapshot(remotes.find(r => r.id === id)));
  io.update.mockImplementation(async (id, payload) => {
    const remote = remotes.find(r => r.id === id)!;
    Object.assign(remote, payload, { etag: "v2", modifiedTime: commitA });
    return snapshot(remote);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("schedule preservation through the real runner and mapping", () => {
  it("keeps a remote one-hour interval on title-only edits", async () => {
    expect((await runTickTickSync()).ok).toBe(true);
    expect(remotes[0]).toMatchObject({ title: "Task A", startDate: "2026-10-17T14:00:00.000+0000", dueDate: "2026-10-17T15:00:00.000+0000" });
  });
  it("keeps start-only schedules on title-only edits", async () => {
    delete remotes[0].dueDate; rows[0].dueDate = null;
    expect((await runTickTickSync()).ok).toBe(true);
    expect(remotes[0].startDate).toBe("2026-10-17T14:00:00.000+0000");
    expect(remotes[0].dueDate ?? null).toBeNull();
  });
  it("moves both ends by the same amount on a timed reschedule", async () => {
    rows[0].dueDate = new Date("2026-10-18T17:00:00Z");
    await runTickTickSync();
    expect(remotes[0]).toMatchObject({ startDate: "2026-10-18T16:00:00.000+0000", dueDate: "2026-10-18T17:00:00.000+0000" });
  });
  it("preserves an all-day multi-day duration on reschedule", async () => {
    Object.assign(remotes[0], { isAllDay: true, startDate: "2026-10-17T03:00:00.000+0000", dueDate: "2026-10-19T03:00:00.000+0000" });
    Object.assign(rows[0], { allDay: true, dueDate: new Date("2026-10-22T00:00:00Z") });
    await runTickTickSync();
    expect(remotes[0]).toMatchObject({ startDate: "2026-10-20T03:00:00.000+0000", dueDate: "2026-10-22T03:00:00.000+0000" });
  });
  it("keeps due-only tasks due-only when rescheduled", async () => {
    delete remotes[0].startDate;
    rows[0].dueDate = new Date("2026-10-18T17:00:00Z");
    await runTickTickSync();
    expect(remotes[0]).toMatchObject({ startDate: null, dueDate: "2026-10-18T17:00:00.000+0000" });
  });
  it("resets duration when switching between timed and all-day", async () => {
    Object.assign(rows[0], { allDay: true, dueDate: new Date("2026-10-18T00:00:00Z") });
    await runTickTickSync();
    expect(remotes[0]).toMatchObject({ isAllDay: true, startDate: "2026-10-18T03:00:00.000+0000", dueDate: "2026-10-18T03:00:00.000+0000" });
  });
  it("clears both ends when the local due date is explicitly removed", async () => {
    Object.assign(rows[0], { dueDate: null });
    await runTickTickSync();
    expect(remotes[0]).toMatchObject({ startDate: null, dueDate: null });
  });
});

describe("own remote commits with concurrent local edits", () => {
  it.each(["update", "create"])("push %s retains B and pushes B on the next sync even when A committed later", async kind => {
    if (kind === "create") {
      Object.assign(rows[0], { tickTickId: null, tickTickProjectId: null, tickTickEtag: null, tickTickModified: null, syncedAt: null });
      remotes = [];
      io.create.mockImplementation(async payload => {
        Object.assign(rows[0], { title: "Task B", updatedAt: revisionB });
        const saved = { ...payload, id: "remote", etag: "v2", modifiedTime: commitA, status: 0 };
        remotes.push(saved); return snapshot(saved);
      });
    } else {
      io.update.mockImplementationOnce(async (_id, payload) => {
        Object.assign(rows[0], { title: "Task B", updatedAt: revisionB });
        Object.assign(remotes[0], payload, { etag: "v2", modifiedTime: commitA });
        return snapshot(remotes[0]);
      });
    }
    await runTickTickSync();
    expect(rows[0].title).toBe("Task B");
    expect(rows[0].updatedAt).toEqual(revisionB);
    expect(rows[0].syncedAt).toEqual(kind === "create" ? null : baseline);
    expect(rows[0].tickTickModified).toEqual(new Date(commitA));
    expect(rows[0].tickTickEtag).toBe("v2");
    expect((await runTickTickSync()).ok).toBe(true);
    expect(rows[0].title).toBe("Task B");
    expect(remotes[0].title).toBe("Task B");
    expect(io.create).toHaveBeenCalledTimes(kind === "create" ? 1 : 0);
  });
  it("records etag-only commits so their missing timestamp cannot overwrite B", async () => {
    io.update.mockImplementationOnce(async (_id, payload) => {
      Object.assign(rows[0], { title: "Task B", updatedAt: revisionB });
      Object.assign(remotes[0], payload, { etag: "v2", modifiedTime: undefined });
      return snapshot(remotes[0]);
    });
    await runTickTickSync();
    expect(rows[0]).toMatchObject({ tickTickEtag: "v2", tickTickModified: null, updatedAt: revisionB, syncedAt: baseline });
    await runTickTickSync();
    expect(remotes[0].title).toBe("Task B");
    expect(rows[0].title).toBe("Task B");
  });
  it.each([false, true])("completion preserves B and never completes twice (recurring=%s)", async recurring => {
    Object.assign(rows[0], { status: "done", completedAt: revisionA, isRecurring: recurring });
    if (recurring) remotes[0].repeatFlag = "RRULE:FREQ=DAILY";
    io.complete.mockImplementation(async () => {
      Object.assign(rows[0], { title: "Task B", updatedAt: revisionB });
      // A repeated occurrence may have the same date; the completion intent is still consumed.
      Object.assign(remotes[0], { status: recurring ? 0 : 2, etag: "v2", modifiedTime: commitA });
    });
    await runTickTickSync();
    expect(rows[0]).toMatchObject({ title: "Task B", updatedAt: revisionB, syncedAt: baseline, tickTickEtag: "v2", tickTickModified: new Date(commitA) });
    expect(rows[0].status).toBe(recurring ? "pending" : "done");
    await runTickTickSync();
    expect(rows[0].title).toBe("Task B");
    expect(io.complete).toHaveBeenCalledTimes(1);
    if (recurring) expect(remotes[0].title).toBe("Task B");
  });
});

describe("remote revision comparison", () => {
  it("recognizes an external etag change even if modifiedTime did not advance", async () => {
    rows[0].updatedAt = baseline;
    remotes[0].etag = "external-change";
    expect((await runTickTickSync()).counts.pullUpdate).toBe(1);
    expect(rows[0].title).toBe("Task old");
  });
  it("does not repeatedly pull an acknowledged etag-only revision", async () => {
    Object.assign(rows[0], { updatedAt: baseline, tickTickModified: null });
    delete remotes[0].modifiedTime;
    const result = await runTickTickSync();
    expect(result.ok).toBe(true);
    expect(result.counts.pullUpdate).toBe(0);
  });
});

describe("initial matching convergence", () => {
  beforeEach(() => {
    Object.assign(rows[0], { tickTickId: null, tickTickProjectId: null, tickTickEtag: null, tickTickModified: null, syncedAt: null });
    Object.assign(remotes[0], { title: "Task A", content: "remote description", priority: 5, repeatFlag: "RRULE:FREQ=WEEKLY" });
  });
  it("adopts remote content, priority and recurrence once and converges", async () => {
    expect((await runTickTickSync()).ok).toBe(true);
    expect(rows[0]).toMatchObject({ description: "remote description", priority: "alta", isRecurring: true, tickTickId: "remote" });
    const next = await runTickTickSync();
    expect(next.ok).toBe(true);
    expect(Object.values(next.counts).reduce((a, b) => a + b, 0)).toBe(0);
    expect(io.update).not.toHaveBeenCalled(); expect(io.create).not.toHaveBeenCalled();
  });
  it("does not link or overwrite a concurrent edit after the version check", async () => {
    beforeWrite = () => Object.assign(rows[0], { description: "new local edit", updatedAt: revisionB });
    expect((await runTickTickSync()).ok).toBe(false);
    expect(rows[0]).toMatchObject({ description: "new local edit", tickTickId: null, updatedAt: revisionB });
  });
});

describe("recurrence conflict recovery", () => {
  it("reconciles a same-date etag conflict, surfaces a warning, processes unrelated work and can be retried", async () => {
    Object.assign(rows[0], { status: "done", completedAt: revisionA, isRecurring: true });
    Object.assign(remotes[0], { etag: "v2", content: "remote recurrence", priority: 5, repeatFlag: "RRULE:FREQ=DAILY" });
    rows.push({ ...makeRow(), id: "other", tickTickId: "other-remote", title: "Other edited" });
    remotes.push({ ...remotes[0], id: "other-remote", etag: "v1", repeatFlag: "" });
    const result = await runTickTickSync();
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("warnings", [expect.stringContaining("Task old")]);
    expect(rows[0]).toMatchObject({ status: "pending", completedAt: null, title: "Task old", description: "remote recurrence", priority: "alta", tickTickEtag: "v2" });
    expect(remotes[1].title).toBe("Other edited");
    expect((await getSyncStatus()).lastError).toContain("Task old");
    expect(io.complete).not.toHaveBeenCalled();
    await runTickTickSync();
    expect(io.complete).not.toHaveBeenCalled();
    // A new, explicit completion after reviewing the restored occurrence is allowed.
    Object.assign(rows[0], { status: "done", completedAt: new Date(Date.now() + 1000), updatedAt: new Date(Date.now() + 1000) });
    io.complete.mockImplementation(async () => { remotes[0].status = 2; });
    expect((await runTickTickSync()).ok).toBe(true);
    expect(io.complete).toHaveBeenCalledTimes(1);
  });
});

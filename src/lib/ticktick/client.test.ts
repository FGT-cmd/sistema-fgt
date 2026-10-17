import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { listSyncedProjects, listOpenTasks, getTask, completeTask, deleteTask, moveTask, TickTickAuthError, TickTickNotFoundError } from "./client";
import type { ListName } from "./types";
beforeEach(() => { vi.stubEnv("TICKTICK_ACCESS_TOKEN", "test-only-token"); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); })); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const respond = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), {status})));
it("filters personal and closed projects", async () => {
  respond([{id: "w", name: "💼 Work"}, {id: "p", name: "Pessoal"}, {id: "e", name: "Estudos", closed: true}]);
  expect(await listSyncedProjects()).toEqual([{id: "w", listName: "Work"}]);
});
it.each([401, 403])("classifies authentication errors (%i)", async status => { respond({}, status); await expect(getTask("w", "t")).rejects.toBeInstanceOf(TickTickAuthError); });
it.each([404, 204])("classifies missing tasks (%i)", async status => { respond(undefined, status); await expect(getTask("w", "t")).rejects.toBeInstanceOf(TickTickNotFoundError); });
it("rejects missing credentials before network", async () => { vi.stubEnv("TICKTICK_ACCESS_TOKEN", ""); await expect(getTask("w", "t")).rejects.toBeInstanceOf(TickTickAuthError); });
it("rejects unapproved lists before network", async () => { await expect(listOpenTasks("p", "Pessoal" as ListName)).rejects.toThrow(/list/i); });
it("filters completed tasks and tasks belonging to another project", async () => {
 respond({tasks: [{id: "a", projectId: "w", title: "A", status: 0}, {id: "b", projectId: "w", status: 2}, {id: "c", projectId: "p", status: 0}]});
 expect((await listOpenTasks("w", "Work")).map(t => t.id)).toEqual(["a"]);
});
it("accepts empty success responses for completion and deletion", async () => { respond(undefined, 204); await expect(completeTask("w", "t")).resolves.toBeUndefined(); await expect(deleteTask("w", "t")).resolves.toBeUndefined(); });

it.each([null, {}, {projects: []}, [{id: "w"}]])("rejects malformed projects instead of reporting an empty snapshot", async body => {
 respond(body); await expect(listSyncedProjects()).rejects.toThrow();
});
it.each([null, {}, {tasks: null}, {tasks: {}}, {tasks: [null]}, {tasks: [{id: "r"}]}])("rejects malformed task snapshots", async body => {
 respond(body); await expect(listOpenTasks("w", "Work")).rejects.toThrow();
});

it.each([200, 201, 204])("moves the same task with the official array payload (%i)", async status => {
  respond(status === 200 ? [{id: "t", etag: "new"}] : undefined, status);
  await expect(moveTask("t", "w", "e")).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("https://api.ticktick.com/open/v1/task/move", expect.objectContaining({
    method: "POST", body: JSON.stringify([{fromProjectId: "w", toProjectId: "e", taskId: "t"}]),
  }));
});
it("aborts a stalled fetch after 15 seconds", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    signal = init.signal as AbortSignal;
    signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), {once: true});
  })));
  const result = expect(listSyncedProjects()).rejects.toMatchObject({name: "AbortError"});
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("keeps the timeout active while reading the response body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => ({
    status: 200, ok: true,
    text: () => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("body timeout")))),
  })));
  const result = expect(listSyncedProjects()).rejects.toThrow("body timeout");
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
it("clears the deadline after successful requests and HTTP failures", async () => {
  vi.useFakeTimers();
  respond([]);
  await expect(listSyncedProjects()).resolves.toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  respond({}, 500);
  await expect(listSyncedProjects()).rejects.toThrow(/500/);
  expect(vi.getTimerCount()).toBe(0);
});
it("accepts a genuinely empty task snapshot", async () => {
  respond({tasks: []});
  await expect(listOpenTasks("w", "Work")).resolves.toEqual([]);
});
it.each([{title: 42}, {dueDate: "invalid"}, {isAllDay: "false"}, {status: "2"}, {priority: 9}])("rejects malformed task fields before normalizing", async fields => {
  respond({tasks: [{id: "t", projectId: "w", ...fields}]});
  await expect(listOpenTasks("w", "Work")).rejects.toThrow(/Malformed/);
});
it("rejects duplicate or ambiguous project snapshots", async () => {
  respond([{id: "w", name: "Work"}, {id: "w2", name: "💼 Work"}]);
  await expect(listSyncedProjects()).rejects.toThrow(/Ambiguous/);
  respond([{id: "w", name: "Work"}, {id: "w", name: "Estudos"}]);
  await expect(listSyncedProjects()).rejects.toThrow(/Duplicate/);
});
it("rejects duplicate task IDs", async () => {
  respond({tasks: [{id: "t", projectId: "w"}, {id: "t", projectId: "w"}]});
  await expect(listOpenTasks("w", "Work")).rejects.toThrow(/Duplicate/);
});
it("does not fetch for unapproved lists even with a valid mock response", async () => {
  respond({tasks: []});
  await expect(listOpenTasks("p", "Pessoal" as ListName)).rejects.toThrow(/list/i);
  expect(fetch).not.toHaveBeenCalled();
});

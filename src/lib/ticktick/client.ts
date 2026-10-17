// Cliente mínimo da TickTick Open API v1 (https://api.ticktick.com/open/v1).
// Token: TICKTICK_ACCESS_TOKEN (mesmo da ponte do Jarvis; sem refresh automático).

import { listNameFromProject, parseTickTickDate, toRemoteTask } from "./mapping";
import { SYNCED_LISTS, type ListName, type RemoteTask, type TickTickApiProject, type TickTickApiTask } from "./types";

const API = "https://api.ticktick.com/open/v1";

export class TickTickAuthError extends Error {}
export class TickTickNotFoundError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.TICKTICK_ACCESS_TOKEN?.trim();
  if (!token) throw new TickTickAuthError("TICKTICK_ACCESS_TOKEN não configurado");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) throw new TickTickAuthError(`TickTick ${res.status}`);
    if (res.status === 404) throw new TickTickNotFoundError(path);
    if (!res.ok) throw new Error(`TickTick ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function isTask(value: unknown): value is TickTickApiTask {
  if (!record(value) || !nonempty(value.id) || !nonempty(value.projectId)) return false;
  for (const key of ["title", "content", "desc", "repeatFlag", "etag"]) {
    if (value[key] != null && typeof value[key] !== "string") return false;
  }
  for (const key of ["dueDate", "startDate", "modifiedTime"]) {
    const date = value[key];
    if (date != null && (typeof date !== "string" || (date !== "" && !parseTickTickDate(date)))) return false;
  }
  return (value.isAllDay == null || typeof value.isAllDay === "boolean")
    && (value.priority == null || [0, 1, 3, 5].includes(value.priority as number))
    && (value.status == null || [0, 1, 2].includes(value.status as number));
}

export async function listSyncedProjects(): Promise<{ id: string; listName: ListName }[]> {
  const projects = await call<unknown>("/project");
  if (!Array.isArray(projects) || !projects.every((p): p is TickTickApiProject =>
    record(p) && nonempty(p.id) && nonempty(p.name) && (p.closed == null || typeof p.closed === "boolean"))) {
    throw new Error("Malformed TickTick project list snapshot");
  }
  if (new Set(projects.map(p => p.id)).size !== projects.length) throw new Error("Duplicate TickTick project IDs");
  const synced = projects.flatMap((p) => {
    const listName = !p.closed ? listNameFromProject(p.name) : null;
    return listName ? [{ id: p.id, listName }] : [];
  });
  if (new Set(synced.map(p => p.listName)).size !== synced.length) throw new Error("Ambiguous TickTick list names");
  return synced;
}

export async function listOpenTasks(projectId: string, listName: ListName): Promise<RemoteTask[]> {
  if (!SYNCED_LISTS.includes(listName)) throw new Error("Unapproved TickTick list");
  const data = await call<unknown>(`/project/${encodeURIComponent(projectId)}/data`);
  if (!record(data) || !Array.isArray(data.tasks) || !data.tasks.every(isTask)) {
    throw new Error("Malformed TickTick task data snapshot");
  }
  if (new Set(data.tasks.map(t => t.id)).size !== data.tasks.length) throw new Error("Duplicate TickTick task IDs");
  return data.tasks.filter((t) => t.projectId === projectId && t.status !== 2).map((t) => toRemoteTask(t, listName));
}

export async function getTask(projectId: string, taskId: string): Promise<TickTickApiTask> {
  const t = await call<TickTickApiTask | null>(`/project/${projectId}/task/${taskId}`);
  if (!t) throw new TickTickNotFoundError(taskId);
  if (!isTask(t) || t.id !== taskId) throw new Error("Malformed TickTick task response");
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

/** Official move endpoint preserves the task ID and recurrence. */
export async function moveTask(taskId: string, fromProjectId: string, toProjectId: string): Promise<void> {
  await call("/task/move", {
    method: "POST",
    body: JSON.stringify([{ fromProjectId, toProjectId, taskId }]),
  });
}

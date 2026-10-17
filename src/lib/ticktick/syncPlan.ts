// Planejador da sincronização TodoTask ↔ TickTick. Puro: decide, não executa.

import { defaultListFor, saoPauloDay } from "./mapping";
import { SYNCED_LISTS, type ListName, type RemoteTask } from "./types";

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
  tickTickEtag?: string | null;
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

const OPEN = new Set(["pending", "waiting", "in_progress"]);
const t = (iso: string | null) => (iso ? Date.parse(iso) : 0);
const normTitle = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// Dia inteiro local é gravado como meia-noite UTC: o dia é a própria data, não a de SP.
const localDay = (l: LocalTask) => (!l.dueDate ? "" : l.allDay ? l.dueDate.slice(0, 10) : saoPauloDay(new Date(l.dueDate)));
const remoteDay = (r: RemoteTask) => (r.dueDate ? saoPauloDay(new Date(r.dueDate)) : "");

function listFor(l: LocalTask): ListName | null {
  if (l.listName === null) return defaultListFor(l.type);
  return SYNCED_LISTS.find((n) => n === l.listName) ?? null;
}

function sameSchedule(l: LocalTask, r: RemoteTask): boolean {
  if (l.allDay !== r.isAllDay) return false;
  if (!l.dueDate || !r.dueDate) return l.dueDate === r.dueDate;
  return l.allDay ? localDay(l) === remoteDay(r) : t(l.dueDate) === t(r.dueDate);
}

export function planSync(
  locals: LocalTask[],
  remotes: RemoteTask[],
  projectIdByList: Record<ListName, string>,
): SyncAction[] {
  const actions: SyncAction[] = [];
  // Runtime guards are needed even though the public input is statically typed.
  remotes = remotes.filter((r) => SYNCED_LISTS.includes(r.listName)
    && !!projectIdByList[r.listName] && projectIdByList[r.listName] === r.projectId);
  const remoteById = new Map(remotes.map((r) => [r.id, r]));
  const claimed = new Set<string>();

  for (const l of locals) {
    if (!l.tickTickId) continue;
    claimed.add(l.tickTickId);
    const list = listFor(l);
    if (!list || !projectIdByList[list]) continue;
    // Do not direct writes or lookups to a project outside the approved set.
    if (!l.tickTickProjectId || !SYNCED_LISTS.some((name) => projectIdByList[name] === l.tickTickProjectId)) continue;
    const r = remoteById.get(l.tickTickId);

    if (!r) {
      // Fora das abertas: concluída, apagada ou movida no TickTick. Só investiga se aqui está aberta.
      if (OPEN.has(l.status) || (l.status === "done" && l.isRecurring)) actions.push({ kind: "checkMissing", local: l });
      continue;
    }
    if (l.status === "cancelled") {
      actions.push({ kind: "pushDelete", local: l });
      continue;
    }
    // Acknowledged executor writes stamp updatedAt and syncedAt equally.
    const localChanged = !l.syncedAt || t(l.updatedAt) > t(l.syncedAt);
    if (l.status === "done") {
      actions.push(localChanged
        ? { kind: "pushComplete", local: l }
        : { kind: "pullUpdate", localId: l.id, remote: r });
      continue;
    }

    const remoteChanged = l.tickTickEtag && r.etag
      ? l.tickTickEtag !== r.etag
      : !l.tickTickModified || t(r.modifiedTime) > t(l.tickTickModified);
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
    const list = listFor(l);
    if (!list || !projectIdByList[list]) continue;
    const match = unclaimed.find(
      (r) => !claimed.has(r.id) && normTitle(r.title) === normTitle(l.title) && r.listName === list && sameSchedule(l, r),
    );
    if (match) {
      claimed.add(match.id);
      actions.push({ kind: "link", localId: l.id, remote: match });
    } else {
      actions.push({ kind: "pushCreate", local: l, listName: list });
    }
  }

  for (const r of unclaimed) {
    if (!claimed.has(r.id)) actions.push({ kind: "pullCreate", remote: r });
  }
  return actions;
}

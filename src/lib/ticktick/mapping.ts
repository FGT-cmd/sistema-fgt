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

export function localToTickTickPayload(l: LocalTaskForPush, projectId: string, fetched?: TickTickApiTask): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(l.tickTickId ? { id: l.tickTickId } : {}),
    title: l.title,
    content: l.description ?? "",
    projectId,
    priority: priorityToTickTick(normalizePriority(l.priority)),
    isAllDay: l.allDay,
    timeZone: TZ,
  };
  if (fetched) {
    const previous = remoteToLocalFields(toRemoteTask(fetched, "Work"));
    if (previous.dueDate?.getTime() === l.dueDate?.getTime() && previous.allDay === l.allDay) {
      // The local editor only represents dueDate. Leave the entire fetched schedule
      // untouched, including duration, start-only dates and the remote timezone.
      delete payload.isAllDay;
      delete payload.timeZone;
      return payload;
    }
  }
  if (l.dueDate) {
    const due = l.allDay
      ? `${l.dueDate.toISOString().slice(0, 10)}T03:00:00.000+0000`
      : formatTickTickDate(l.dueDate.toISOString());
    payload.dueDate = due;
    // Rescheduling keeps elapsed duration within the same date mode. Switching
    // between timed/all-day resets to a point; a due-only task stays due-only.
    const oldStart = parseTickTickDate(fetched?.startDate);
    const oldDue = parseTickTickDate(fetched?.dueDate);
    const duration = oldStart && oldDue && (fetched?.isAllDay !== false) === l.allDay
      ? Math.max(0, Date.parse(oldDue) - Date.parse(oldStart)) : 0;
    payload.startDate = fetched && !oldStart && oldDue ? null
      : formatTickTickDate(new Date(Date.parse(parseTickTickDate(due)!) - duration).toISOString());
  } else if (l.tickTickId) {
    // An update must explicitly clear dates; omission preserves the old schedule.
    payload.dueDate = null;
    payload.startDate = null;
  }
  return payload;
}

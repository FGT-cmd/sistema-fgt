// Pure agenda projections. No database or network imports at runtime.
import type { GoogleEvent } from "@/lib/google-calendar";
import { normalizePriority,saoPauloDay } from "@/lib/ticktick/mapping";
export type AgendaTask={
  kind: "task";
  id: string;
  title: string;
  description: string|null;
  day: string|null;
  time: string|null;
  allDay: boolean;
  priority: "alta"|"media"|"baixa"|"nenhuma";
  listName: string|null;
  isRecurring: boolean;
  status: string;
  urgent?: boolean|null;
  important?: boolean|null;
};
export type AgendaEvent={
  kind: "event";
  id: string;
  title: string;
  description: string;
  day: string;
  endDay: string;
  time: string|null;
  endTime: string|null;
  color: string|null;
  htmlLink: string|null;
  client: {
    id: string;
    name: string;
  }|null;
};
export type AgendaItem=AgendaTask|AgendaEvent;
const hhmm=(d: Date) => new Intl.DateTimeFormat("pt-BR",{
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
}).format(d);
export function taskFromRow(row: {
  id: string;
  title: string;
  description: string|null;
  dueDate: Date|string|null;
  allDay: boolean;
  priority: string;
  listName: string|null;
  isRecurring: boolean;
  status: string;
  urgent?: boolean|null;
  important?: boolean|null;
}): AgendaTask {
  const d=row.dueDate? new Date(row.dueDate):null;
  return {
    kind: "task",
    id: row.id,
    title: row.title,
    description: row.description,
    day: d? row.allDay? d.toISOString().slice(0,10):saoPauloDay(d):null,
    time: d&&!row.allDay? hhmm(d):null,
    allDay: row.allDay,
    priority: normalizePriority(row.priority),
    listName: row.listName,
    isRecurring: row.isRecurring,
    status: row.status,
    urgent: row.urgent,
    important: row.important
  };
}
export function eventFromGoogle(e: GoogleEvent): AgendaEvent {
  const start=e.start.dateTime? new Date(e.start.dateTime):null,
    end=e.end.dateTime? new Date(e.end.dateTime):null;
  const tag=e.description?.match(/\[FGT:([^:]+):([^\]]+)\]/);
  return {
    kind: "event",
    id: e.id,
    title: e.summary||"Sem título",
    description: (e.description??"").replace(/\[FGT:[^\]]+\]/g,"").trim(),
    client: tag? {
      id: tag[1],
      name: tag[2]
    }:null,
    day: start? saoPauloDay(start):e.start.date!,
    endDay: end? saoPauloDay(end):e.end.date!,
    time: start? hhmm(start):null,
    endTime: end? hhmm(end):null,
    color: e.colorId??null,
    htmlLink: e.htmlLink??null
  };
}
export function addDays(day: string,n: number): string {
  const d=new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
export function parseRange(from: string|null,to: string|null) {
  const valid=(s: string|null): s is string => !!s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!valid(from)||!valid(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>365) return null;
  return {
    from,
    to,
    timeMin: `${from}T00:00:00-03:00`,
    timeMax: `${addDays(to,1)}T00:00:00-03:00`
  };
}
const PRIO={
  alta: 0,
  media: 1,
  baixa: 2,
  nenhuma: 3
};
export function sortItems(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a,b) => (a.time??"").localeCompare(b.time??"")||(a.kind==="task"? PRIO[a.priority]:1)-(b.kind==="task"? PRIO[b.priority]:1));
}
const open=(i: AgendaItem) => i.kind==="event"||!["done","cancelled"].includes(i.status);
// Google ends are exclusive; a timed event ending at midnight does not occupy that day.
function occurs(i: AgendaItem,day: string) {
  if(!open(i)) return false;
  if(i.kind==="task") return i.day===day;
  return i.day<=day&&(day<i.endDay||day===i.endDay&&!!i.time&&i.endTime!=="00:00");
}
function onDay(items: AgendaItem[],day: string) {
  return sortItems(items.filter(i => occurs(i,day)).map(i => i.kind==="event"&&i.time? {
    ...i,
    time: day>i.day? "00:00":i.time,
    endTime: day<i.endDay? "24:00":i.endTime
  }:i));
}
export function todayView(items: AgendaItem[],today: string) {
  const tasks=items.filter((i): i is AgendaTask => i.kind==="task"&&open(i));
  return {
    overdue: sortItems(tasks.filter(t => t.day&&t.day<today)) as AgendaTask[],
    today: onDay(items,today),
    noDate: sortItems(tasks.filter(t => !t.day)) as AgendaTask[]
  };
}
export function weekView(items: AgendaItem[],today: string) {
  return Array.from({
    length: 7
  },(_,i) => {
    const day=addDays(today,i);
    return {
      day,
      items: onDay(items,day)
    };
  });
}
export function monthGrid(items: AgendaItem[],year: number,month: number) {
  const first=`${year}-${String(month).padStart(2,"0")}-01`,
    start=addDays(first,-new Date(`${first}T12:00:00Z`).getUTCDay());
  return Array.from({
    length: 42
  },(_,i) => {
    const day=addDays(start,i);
    return {
      day,
      inMonth: day.slice(0,7)===first.slice(0,7),
      items: onDay(items,day)
    };
  });
}
export function weekGrid(items: AgendaItem[],weekStart: string) {
  return weekView(items,weekStart).map(d => ({
    day: d.day,
    allDay: d.items.filter(i => !i.time),
    timed: d.items.filter(i => !!i.time)
  }));
}
export function matrixFlags(priority: AgendaTask["priority"]) {
  return {
    urgent: priority==="alta"||priority==="baixa",
    important: priority==="alta"||priority==="media"
  };
}
export function matrixView(items: AgendaItem[]) {
  const result: Record<"q1"|"q2"|"q3"|"q4",AgendaTask[]>={
    q1: [],
    q2: [],
    q3: [],
    q4: []
  };
  for(const i of sortItems(items)) {
    if(i.kind!=="task"||!open(i)) continue;
    const fallback=matrixFlags(i.priority),
      urgent=i.urgent??fallback.urgent,
      important=i.important??fallback.important;
    result[important? urgent? "q1":"q2":urgent? "q3":"q4"].push(i);
  }
  return result;
}

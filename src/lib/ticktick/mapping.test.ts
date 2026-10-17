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

it("keeps timed instants across the São Paulo midnight boundary", () => {
  const r = toRemoteTask({id: "r", projectId: "w", dueDate: "2026-10-17T02:59:59.000+0000", isAllDay: false}, "Work");
  expect(remoteToLocalFields(r).dueDate?.toISOString()).toBe("2026-10-17T02:59:59.000Z");
});
it("rejects invalid date strings and unknown lists", () => {
  expect(parseTickTickDate("invalid")).toBeNull();
  expect(listNameFromProject("Work pessoal")).toBeNull();
});

it("clears both dates on updates while omitting dates on creates", () => {
  const task = {title: "Sem data", description: null, dueDate: null, allDay: true, priority: "media", tickTickId: null};
  const create = localToTickTickPayload(task, "w");
  expect(create).not.toHaveProperty("dueDate");
  expect(create).not.toHaveProperty("startDate");
  expect(localToTickTickPayload({...task, tickTickId: "t"}, "w")).toMatchObject({id: "t", dueDate: null, startDate: null});
});

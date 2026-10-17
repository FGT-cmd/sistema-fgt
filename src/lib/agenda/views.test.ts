import { describe,it,expect } from "vitest";
import { taskFromRow,eventFromGoogle,todayView,weekView,monthGrid,weekGrid,matrixView,sortItems,parseRange } from "./views";
const row=(p={}) => ({
  id: "t",
  title: "x",
  description: null,
  dueDate: null as Date|string|null,
  allDay: true,
  priority: "media",
  listName: "Work",
  isRecurring: false,
  status: "pending",
  ...p
});
describe("agenda conversions",() => {
  it("uses UTC date for all-day tasks and Sao Paulo for timed tasks",() => {
    expect(taskFromRow(row({
      dueDate: new Date("2026-10-16T00:00:00Z")
    }))).toMatchObject({
      day: "2026-10-16",
      time: null
    });
    expect(taskFromRow(row({
      dueDate: "2026-10-17T01:30:00Z",
      allDay: false,
      priority: "high"
    }))).toMatchObject({
      day: "2026-10-16",
      time: "22:30",
      priority: "alta"
    });
  });
  it("retains Google exclusive end and student metadata",() => {
    const e=eventFromGoogle({
      id: "e",
      summary: "Retiro",
      description: "[FGT:c:Ana] Nota",
      start: {
        date: "2026-10-16"
      },
      end: {
        date: "2026-10-19"
      }
    });
    expect(e).toMatchObject({
      day: "2026-10-16",
      endDay: "2026-10-19",
      time: null,
      client: {
        id: "c",
        name: "Ana"
      },
      description: "Nota"
    });
    expect(weekView([e],"2026-10-16").map(d => d.items.length)).toEqual([1,1,1,0,0,0,0]);
  });
  it("clips timed overnight events and excludes midnight end day",() => {
    const e=eventFromGoogle({
      id: "e",
      summary: "Viagem",
      start: {
        dateTime: "2026-10-16T23:00:00-03:00"
      },
      end: {
        dateTime: "2026-10-18T00:00:00-03:00"
      }
    });
    const g=weekGrid([e],"2026-10-16");
    expect(g[0].timed[0]).toMatchObject({
      time: "23:00",
      endTime: "24:00"
    });
    expect(g[1].timed[0]).toMatchObject({
      time: "00:00",
      endTime: "24:00"
    });
    expect(g[2].timed).toEqual([]);
  });
});
describe("agenda views",() => {
  const items=[taskFromRow(row({
    id: "late",
    dueDate: "2026-10-14"
  })),taskFromRow(row({
    id: "timed",
    dueDate: "2026-10-16T18:00:00Z",
    allDay: false
  })),taskFromRow(row({
    id: "all",
    dueDate: "2026-10-16",
    priority: "alta"
  })),taskFromRow(row({
    id: "none",
    priority: "nenhuma"
  })),taskFromRow(row({
    id: "next",
    dueDate: "2026-10-20",
    priority: "baixa"
  }))];
  it("separates overdue, today and undated",() => {
    const v=todayView(items,"2026-10-16");
    expect(v.overdue.map(x => x.id)).toEqual(["late"]);
    expect(v.today.map(x => x.id)).toEqual(["all","timed"]);
    expect(v.noDate.map(x => x.id)).toEqual(["none"]);
  });
  it("returns seven days and 42 Sunday-first month cells without mutation",() => {
    expect(weekView(items,"2026-10-16")[4].items[0].id).toBe("next");
    const m=monthGrid(items,2026,10);
    expect(m).toHaveLength(42);
    expect(m[0]).toMatchObject({
      day: "2026-09-27",
      inMonth: false
    });
    expect(sortItems(items.slice(1,3)).map(x => x.id)).toEqual(["all","timed"]);
    expect(items[1].id).toBe("timed");
  });
  it("honors explicit flags independently with fallback for absent flags",() => {
    const m=matrixView([...items,taskFromRow({
      ...row(),
      id: "explicit",
      priority: "alta",
      urgent: false,
      important: false
    }),taskFromRow({
      ...row(),
      id: "partial",
      priority: "alta",
      urgent: false
    })]);
    expect(m.q1.map(x => x.id)).toEqual(["all"]);
    expect(m.q4.map(x => x.id)).toContain("explicit");
    expect(m.q2.map(x => x.id)).toContain("partial");
    expect(m.q3.map(x => x.id)).toEqual(["next"]);
  });
  it("excludes done and cancelled tasks",() => {
    const done=taskFromRow(row({
      status: "done",
      dueDate: "2026-10-16"
    }));
    expect(todayView([done],"2026-10-16").today).toEqual([]);
    expect(matrixView([done]).q2).toEqual([]);
  });
});
describe("requested range",() => {
  it("rejects invalid real dates, reversed and excessive intervals",() => {
    for(const [a,b] of [["2026-02-30","2026-03-01"],["2026-10-17","2026-10-16"],["2026-01-01","2027-01-02"],["x","x"]]) expect(parseRange(a,b)).toBeNull();
  });
  it("accepts leap days and returns exclusive next-day Google bound",() => {
    expect(parseRange("2028-02-29","2028-02-29")).toEqual({
      from: "2028-02-29",
      to: "2028-02-29",
      timeMin: "2028-02-29T00:00:00-03:00",
      timeMax: "2028-03-01T00:00:00-03:00"
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  todaySaoPaulo, addDays, daysBetween, isoDate, fmtBRL, fmtDayMonth, monthLabel, round2,
} from "./dates";

describe("dates", () => {
  it("hoje em São Paulo vira o dia anterior antes das 03h UTC", () => {
    expect(todaySaoPaulo(new Date("2026-10-16T02:30:00Z"))).toBe("2026-10-15");
    expect(todaySaoPaulo(new Date("2026-10-16T03:30:00Z"))).toBe("2026-10-16");
  });
  it("soma e diferença de dias atravessam o mês", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
    expect(daysBetween("2026-02-02", "2026-01-30")).toBe(3);
  });
  it("isoDate pega a data UTC", () => {
    expect(isoDate(new Date("2026-01-08T12:00:00Z"))).toBe("2026-01-08");
  });
  it("formata valores e datas em pt-BR", () => {
    expect(fmtBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(fmtDayMonth("2026-10-05")).toBe("05/10");
    expect(monthLabel("2026-10")).toBe("outubro/2026");
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

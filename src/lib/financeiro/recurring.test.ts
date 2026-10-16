import { describe, it, expect } from "vitest";
import {
  dueDateFor, planRecurringForMonth, previousMonth, buildMonthlyMessage, type RecurringCostRow,
} from "./recurring";

const cost = (p: Partial<RecurringCostRow> & Pick<RecurringCostRow, "id">): RecurringCostRow => ({
  category: "Contabilidade", description: "Contabilidade", amount: 398, dayOfMonth: 10,
  paymentMethod: "Pix/débito PJ", active: true, ...p,
});

describe("recurring", () => {
  it("vencimento respeita o último dia do mês", () => {
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateFor("2026-10", 10)).toBe("2026-10-10");
    expect(dueDateFor("2026-10", 0)).toBe("2026-10-01");
  });

  it("gera só os ativos que ainda não foram gerados no mês", () => {
    const drafts = planRecurringForMonth(
      [cost({ id: "a" }), cost({ id: "b", active: false }), cost({ id: "c", amount: 600, category: "Estagiário", description: "Estagiário", dayOfMonth: 8 })],
      "2026-10",
      new Set(["a"]),
    );
    expect(drafts).toEqual([
      { recurringCostId: "c", description: "Estagiário", amount: 600, category: "Estagiário", dueDate: "2026-10-08", paymentMethod: "Pix/débito PJ" },
    ]);
  });

  it("mês anterior atravessa o ano", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });

  it("mensagem da virada lista os fixos, pede o extrato do mês anterior e cita revisões", () => {
    const msg = buildMonthlyMessage({
      month: "2026-11",
      created: [{ recurringCostId: "c", description: "Contabilidade", amount: 398, category: "Contabilidade", dueDate: "2026-11-10", paymentMethod: null }],
      reviewCount: 3,
    });
    expect(msg).toContain("novembro/2026");
    expect(msg).toContain("Contabilidade");
    expect(msg).toContain("dia 10");
    expect(msg).toContain("outubro/2026");
    expect(msg).toContain("3 lançamentos");
  });

  it("sem fixos novos e sem revisão, a mensagem só pede o extrato", () => {
    const msg = buildMonthlyMessage({ month: "2026-11", created: [], reviewCount: 0 });
    expect(msg).not.toContain("Lancei");
    expect(msg).not.toContain("revisão");
    expect(msg).toContain("extrato");
  });
});

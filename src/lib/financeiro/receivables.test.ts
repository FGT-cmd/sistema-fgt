import { describe, it, expect } from "vitest";
import {
  nextBusinessDay,
  defaultCashDate,
  netValueOf,
  sumTotals,
  buildPreset,
  emptyLine,
  toApiInstallments,
  toNumber,
  type ReceivableLine,
} from "./receivables";

function line(over: Partial<ReceivableLine> = {}): ReceivableLine {
  return {
    id: "1",
    amount: "100",
    paymentMethod: "Pix",
    dueDate: "2026-07-27",
    cashDate: "2026-07-27",
    feeOwner: "aluno",
    feeValue: "",
    paid: false,
    label: "Pagamento",
    ...over,
  };
}

describe("nextBusinessDay", () => {
  it("avanca um dia em dia util", () => {
    // 2026-07-27 é segunda-feira
    expect(nextBusinessDay("2026-07-27")).toBe("2026-07-28");
  });

  it("pula sabado e domingo quando cai na sexta", () => {
    // 2026-07-31 é sexta-feira -> proximo util é segunda 2026-08-03
    expect(nextBusinessDay("2026-07-31")).toBe("2026-08-03");
  });

  it("pula domingo quando cai no sabado", () => {
    // 2026-08-01 é sabado -> proximo util é segunda 2026-08-03
    expect(nextBusinessDay("2026-08-01")).toBe("2026-08-03");
  });
});

describe("defaultCashDate", () => {
  it("Pix cai no mesmo dia", () => {
    expect(defaultCashDate("2026-07-27", "Pix")).toBe("2026-07-27");
  });

  it("Cartao cai em um dia util", () => {
    expect(defaultCashDate("2026-07-27", "Cartão")).toBe("2026-07-28");
  });

  it("Cartao numa sexta cai na segunda", () => {
    expect(defaultCashDate("2026-07-31", "Cartão")).toBe("2026-08-03");
  });

  it("demais formas caem no mesmo dia", () => {
    expect(defaultCashDate("2026-07-27", "Dinheiro")).toBe("2026-07-27");
  });
});

describe("netValueOf", () => {
  it("taxa do aluno: liquido igual ao bruto", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "aluno", feeValue: "70" }))).toBe(1500);
  });

  it("taxa da empresa: liquido desconta a taxa", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "empresa", feeValue: "70" }))).toBe(1430);
  });

  it("taxa da empresa sem valor informado: liquido igual ao bruto", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "empresa", feeValue: "" }))).toBe(1500);
  });

  it("aceita valor com virgula decimal", () => {
    expect(netValueOf(line({ amount: "1500,50", feeOwner: "aluno" }))).toBe(1500.5);
  });

  it("aceita formatacao brasileira com separador de milhares (ponto)", () => {
    expect(netValueOf(line({ amount: "1.500,50", feeOwner: "aluno" }))).toBe(1500.5);
  });

  it("desconta taxa com formatacao brasileira", () => {
    expect(netValueOf(line({ amount: "1.500,50", feeOwner: "empresa", feeValue: "100,50" }))).toBe(1400);
  });

  it("toNumber: ponto como separador decimal (sem separador de milhares)", () => {
    expect(netValueOf(line({ amount: "1500.50", feeOwner: "aluno" }))).toBe(1500.5);
  });

  it("toNumber: ponto como separador decimal em valor pequeno", () => {
    expect(netValueOf(line({ amount: "222.34", feeOwner: "aluno" }))).toBe(222.34);
  });

  it("toNumber: ponto como separador de milhares (padrão x.xxx)", () => {
    expect(netValueOf(line({ amount: "1.500", feeOwner: "aluno" }))).toBe(1500);
  });

  it("toNumber: multiplos grupos de milhares", () => {
    expect(netValueOf(line({ amount: "1.500.000", feeOwner: "aluno" }))).toBe(1500000);
  });

  it("toNumber: inteiro puro", () => {
    expect(netValueOf(line({ amount: "1500", feeOwner: "aluno" }))).toBe(1500);
  });

  it("toNumber: string vazia", () => {
    expect(netValueOf(line({ amount: "", feeOwner: "aluno" }))).toBe(0);
  });

  it("toNumber: entrada nao numerica", () => {
    expect(netValueOf(line({ amount: "abc", feeOwner: "aluno" }))).toBe(0);
  });
});

describe("sumTotals", () => {
  it("faturamento soma o bruto e caixa soma o liquido", () => {
    const lines = [
      line({ id: "a", amount: "1000", feeOwner: "aluno" }),
      line({ id: "b", amount: "500", feeOwner: "empresa", feeValue: "50" }),
    ];
    expect(sumTotals(lines)).toEqual({ faturamento: 1500, caixa: 1450 });
  });

  it("ignora linhas sem valor", () => {
    const lines = [line({ id: "a", amount: "1000" }), line({ id: "b", amount: "" })];
    expect(sumTotals(lines)).toEqual({ faturamento: 1000, caixa: 1000 });
  });
});

describe("buildPreset", () => {
  it("card_full gera uma linha de cartao com caixa em um dia util", () => {
    const lines = buildPreset("card_full", { total: 2000, startDate: "2026-07-27" });
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe("2000");
    expect(lines[0].paymentMethod).toBe("Cartão");
    expect(lines[0].dueDate).toBe("2026-07-27");
    expect(lines[0].cashDate).toBe("2026-07-28");
  });

  it("pix_full gera uma linha de pix com caixa no mesmo dia", () => {
    const lines = buildPreset("pix_full", { total: 2000, startDate: "2026-07-27" });
    expect(lines).toHaveLength(1);
    expect(lines[0].paymentMethod).toBe("Pix");
    expect(lines[0].cashDate).toBe("2026-07-27");
  });

  it("entry_pix_installments gera entrada mais parcelas mensais", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 1000, startDate: "2026-07-27", entryAmount: 400, parcelas: 3,
    });
    expect(lines).toHaveLength(4);
    expect(lines[0].amount).toBe("400");
    expect(lines[0].label).toBe("Entrada");
    expect(lines[1].amount).toBe("200");
    expect(lines[1].dueDate).toBe("2026-08-27");
    expect(lines[2].dueDate).toBe("2026-09-27");
    expect(lines[3].dueDate).toBe("2026-10-27");
    expect(lines.every(l => l.paymentMethod === "Pix")).toBe(true);
  });

  it("entry_then_card gera entrada mais uma linha de cartao no mes seguinte", () => {
    const lines = buildPreset("entry_then_card", {
      total: 1000, startDate: "2026-07-27", entryAmount: 300,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe("300");
    expect(lines[1].amount).toBe("700");
    expect(lines[1].paymentMethod).toBe("Cartão");
    expect(lines[1].dueDate).toBe("2026-08-27");
    expect(lines[1].cashDate).toBe("2026-08-28");
  });

  it("entry_then_pix gera entrada mais uma linha de pix no mes seguinte", () => {
    const lines = buildPreset("entry_then_pix", {
      total: 1000, startDate: "2026-07-27", entryAmount: 300,
    });
    expect(lines).toHaveLength(2);
    expect(lines[1].paymentMethod).toBe("Pix");
    expect(lines[1].amount).toBe("700");
    expect(lines[1].cashDate).toBe("2026-08-27");
  });

  it("distribui sobra de centavos na primeira parcela", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 1000, startDate: "2026-07-27", entryAmount: 0.01, parcelas: 3,
    });
    const soma = lines.reduce((s, l) => s + Number(l.amount), 0);
    expect(soma).toBeCloseTo(1000, 2);
  });

  it("gera ids unicos por linha", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 900, startDate: "2026-07-27", entryAmount: 300, parcelas: 2,
    });
    const ids = new Set(lines.map(l => l.id));
    expect(ids.size).toBe(lines.length);
  });

  it("entry_then_card com data mes-fim (31) cai no ultimo dia do mes seguinte", () => {
    const lines = buildPreset("entry_then_card", {
      total: 1000, startDate: "2026-01-31", entryAmount: 300,
    });
    expect(lines[1].dueDate).toBe("2026-02-28");
  });

  it("entry_pix_installments com data mes-fim distribui corretamente entre meses", () => {
    const lines = buildPreset("entry_pix_installments", {
      total: 1000, startDate: "2026-01-31", entryAmount: 400, parcelas: 3,
    });
    expect(lines[0].dueDate).toBe("2026-01-31");
    expect(lines[1].dueDate).toBe("2026-02-28");
    expect(lines[2].dueDate).toBe("2026-03-31");
    expect(lines[3].dueDate).toBe("2026-04-30");
  });

  it("entry_pix_installments com divisao nao exata preserva total", () => {
    // Teste de regressão: detecta quando toNumber() mangled valores gerados por buildPreset
    const lines = buildPreset("entry_pix_installments", {
      total: 1000, startDate: "2026-07-27", entryAmount: 333, parcelas: 3,
    });
    const totals = sumTotals(lines);
    expect(totals.faturamento).toBeCloseTo(1000, 2);
  });
});

describe("emptyLine", () => {
  it("cria uma linha vazia com padroes seguros", () => {
    const l = emptyLine("2026-07-27");
    expect(l.amount).toBe("");
    expect(l.dueDate).toBe("2026-07-27");
    expect(l.paid).toBe(false);
    expect(l.feeOwner).toBe("aluno");
  });
});

describe("toApiInstallments", () => {
  it("converte linhas em payload da API", () => {
    const lines = [
      line({ id: "a", amount: "1500", feeOwner: "empresa", feeValue: "70",
             paymentMethod: "Cartão", dueDate: "2026-07-27", cashDate: "2026-07-28",
             label: "Entrada", paid: true }),
    ];
    expect(toApiInstallments(lines)).toEqual([
      { amount: 1500, netValue: 1430, paymentMethod: "Cartão",
        dueDate: "2026-07-27", cashDate: "2026-07-28", label: "Entrada", paid: true },
    ]);
  });

  it("descarta linhas com valor zero ou vazio", () => {
    const lines = [line({ id: "a", amount: "100" }), line({ id: "b", amount: "" }),
                   line({ id: "c", amount: "0" })];
    expect(toApiInstallments(lines)).toHaveLength(1);
  });
});

describe("toNumber", () => {
  it("interpreta virgula como separador decimal pt-BR", () => {
    expect(toNumber("1.200,00")).toBe(1200);
  });

  it("interpreta ponto como separador de milhares quando nao ha virgula", () => {
    expect(toNumber("1.200")).toBe(1200);
  });

  it("interpreta ponto como decimal quando nao segue o padrao de milhares", () => {
    expect(toNumber("1.5")).toBe(1.5);
  });
});

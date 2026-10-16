import { describe, it, expect } from "vitest";
import {
  planSeed, buildVocab, accountOfMethod, groupOfCategory, matchLabel,
  accountsOf, methodsForAccount, type ConfigRow,
} from "./vocab";

function row(p: Partial<ConfigRow> & Pick<ConfigRow, "type" | "value">): ConfigRow {
  return { id: p.value, group: null, account: null, active: true, order: 0, ...p };
}

describe("planSeed", () => {
  it("cria todo o vocabulário num banco vazio", () => {
    const plan = planSeed([]);
    expect(plan.create).toHaveLength(26);
    expect(plan.update).toHaveLength(0);
    expect(plan.create.find((c) => c.value === "INSS")).toMatchObject({ type: "expense_cat", group: "fixo" });
    expect(plan.create.find((c) => c.value === "Pix C6")).toMatchObject({ type: "recv_method", account: "C6" });
  });

  it("não duplica item existente com outra grafia e completa o grupo que falta", () => {
    const plan = planSeed([row({ type: "expense_cat", value: "prolabore", id: "p1" })]);
    expect(plan.create.find((c) => c.value === "Prolabore")).toBeUndefined();
    expect(plan.update).toEqual([{ id: "p1", group: "fixo" }]);
  });

  it("não mexe em item que já tem grupo", () => {
    const plan = planSeed([row({ type: "expense_cat", value: "Prolabore", group: "despesa" })]);
    expect(plan.update).toEqual([]);
  });
});

describe("buildVocab", () => {
  const rows: ConfigRow[] = [
    row({ type: "income_cat", value: "Consultoria anual", order: 1 }),
    row({ type: "income_cat", value: "Consultoria semestral", order: 0 }),
    row({ type: "expense_cat", value: "Tráfego pago" }),
    row({ type: "expense_cat", value: "Categoria antiga", active: false }),
    row({ type: "expense_cat", value: "Mensalidade app" }),
    row({ type: "pay_method", value: "Cartão crédito (Natália)" }),
    row({ type: "recv_method", value: "Pix C6", account: "C6" }),
    row({ type: "goal", value: "35000" }),
  ];
  const vocab = buildVocab(rows);

  it("ordena, ignora inativos e itens que não são vocabulário", () => {
    expect(vocab.incomeCategories).toEqual(["Consultoria semestral", "Consultoria anual"]);
    expect(vocab.expenseCategories.map((c) => c.name)).toEqual(["Tráfego pago", "Mensalidade app"]);
  });

  it("usa o grupo do seed quando o banco não tem, e 'despesa' para categoria desconhecida", () => {
    expect(groupOfCategory(vocab, "tráfego PAGO")).toBe("investimento");
    expect(groupOfCategory(vocab, "Mensalidade app")).toBe("despesa");
    expect(groupOfCategory(vocab, "Não existe")).toBeNull();
  });

  it("resolve a conta de cada forma de pagamento", () => {
    expect(accountOfMethod(vocab, "cartao credito (natalia)")).toBe("Cartão Natália");
    expect(accountOfMethod(vocab, "Pix C6")).toBe("C6");
    expect(accountOfMethod(vocab, null)).toBeNull();
    expect(accountsOf(vocab)).toEqual(["Cartão Natália", "C6"]);
    expect(methodsForAccount(vocab, "C6")).toEqual(["Pix C6"]);
  });
});

describe("matchLabel", () => {
  it("casa ignorando acento, caixa e espaços extras", () => {
    expect(matchLabel(["Estagiário", "INSS"], "  estagiario ")).toBe("Estagiário");
    expect(matchLabel(["INSS"], "IRPF")).toBeNull();
    expect(matchLabel(["INSS"], null)).toBeNull();
  });
});

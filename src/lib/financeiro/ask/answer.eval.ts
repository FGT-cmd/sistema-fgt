import { describe, it, expect } from "vitest";
import { answerWithData } from "./answer";
import type { AskData } from "./tools";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { LedgerEntry } from "../ledger";

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const e = (p: Partial<LedgerEntry> & Pick<LedgerEntry, "ref">): LedgerEntry => ({
  kind: "despesa", amount: 100, category: "Outras despesas", description: "x", status: "pago", date: "2026-10-05",
  dueDate: null, paidAt: "2026-10-05", paymentMethod: "Pix/débito PJ", clientName: null, source: "manual",
  needsReview: false, ...p,
});
const data: AskData = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  snapshots: [{ account: "C6", balance: 5000, asOf: "2026-10-01" }],
  monthlyGoal: 35000,
  goals: { reserva_fin: 10000 },
  ledger: [
    e({ ref: "tx:rec", kind: "receita", amount: 10000, category: "Consultoria anual", paymentMethod: "Pix C6" }),
    e({ ref: "tx:pro", amount: 4000, category: "Prolabore" }),
    e({ ref: "tx:ads", amount: 1000, category: "Tráfego pago", paymentMethod: "Cartão crédito (Nubank PF)" }),
    e({ ref: "tx:res", amount: 500, category: "Reserva Financeira" }),
    e({ ref: "tx:cref", amount: 444, status: "pendente", date: "2026-10-31", dueDate: "2026-10-31", paidAt: null, description: "CREF" }),
    e({ ref: "tx:atras", amount: 398, status: "pendente", date: "2026-10-10", dueDate: "2026-10-10", paidAt: null, description: "Contabilidade" }),
  ],
};
// Aceita "398", "398,00" e "R$ 398" — o que importa é o número certo aparecer.
const has = (text: string, n: string) => text.replace(/\./g, "").includes(n);

describe("perguntas reais — ask (gasta API)", () => {
  it("o que temos que pagar hoje? → só a Contabilidade atrasada", async () => {
    const t = await answerWithData("o que temos que pagar hoje?", data);
    console.log("[eval]", t);
    expect(t).not.toMatch(/\*/);
    expect(t).toMatch(/contabilidade/i);
    expect(has(t, "398")).toBe(true);
    expect(t).not.toMatch(/cref/i);
  });
  it("quais contas estão em aberto? → as duas, total 842", async () => {
    const t = await answerWithData("quais contas estão em aberto?", data);
    console.log("[eval]", t);
    expect(t).not.toMatch(/\*/);
    expect(t).toMatch(/cref/i);
    expect(t).toMatch(/contabilidade/i);
  });
  it("qual nosso saldo no C6? → 10.500 estimado, citando a base", async () => {
    // 5.000 (extrato de 01/10) + 10.000 (Pix C6) − 4.000 (prolabore) − 500 (reserva)
    const t = await answerWithData("qual nosso saldo no C6?", data);
    console.log("[eval]", t);
    expect(t).not.toMatch(/\*/);
    expect(has(t, "10500")).toBe(true);
    expect(t).toMatch(/estimad/i);
    expect(t).not.toMatch(/não est(á|ão) no cálculo/i);
  });
  it("qual o resultado do mês? → 5.000", async () => {
    // 10.000 de receita − 4.000 fixo − 1.000 investimento; reserva fica abaixo do resultado
    const t = await answerWithData("qual o resultado do mês?", data);
    console.log("[eval]", t);
    expect(t).not.toMatch(/\*/);
    expect(has(t, "5000")).toBe(true);
  });
  it("quanto falta pra meta? → 25.000", async () => {
    const t = await answerWithData("quanto falta pra bater a meta do mês?", data);
    console.log("[eval]", t);
    expect(t).not.toMatch(/\*/);
    expect(has(t, "25000")).toBe(true);
  });
});

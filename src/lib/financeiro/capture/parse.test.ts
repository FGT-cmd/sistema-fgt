import { describe, it, expect } from "vitest";
import { validateActions, matchClient } from "./parse";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { CaptureContext, RawAction } from "./types";

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const ctx: CaptureContext = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  openItems: [{ ref: "tx:cont", kind: "despesa", description: "Contabilidade", category: "Contabilidade", amount: 398, dueDate: "2026-10-10", clientName: null }],
  recent: [{ ref: "tx:gpt", kind: "despesa", description: "ChatGPT", category: "Ferramentas e plataformas", amount: 57, date: "2026-10-16", needsReview: true }],
  clients: [{ id: "c1", name: "Aleska da Rosa Eli" }, { id: "c2", name: "Andressa da Rosa" }, { id: "c3", name: "Andressa Milhbeier" }],
};
const raw = (p: Partial<RawAction>): RawAction => ({
  action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas", description: "mfit",
  paymentMethod: "Pix/débito PJ", date: "2026-10-16", status: "pago", clientName: null, confidence: "alta",
  alternatives: [], ref: null, question: null, ...p,
});

describe("validateActions", () => {
  it("create claro passa direto, com nomes canônicos", () => {
    const [a] = validateActions([raw({ category: "ferramentas E plataformas", paymentMethod: "pix/debito pj" })], ctx);
    expect(a).toMatchObject({
      action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas",
      paymentMethod: "Pix/débito PJ", status: "pago", needsReview: false, alternatives: [], externalId: null,
    });
  });

  it("categoria inventada vira 'Outras despesas' marcada para revisar", () => {
    const [a] = validateActions([raw({ category: "Software" })], ctx);
    expect(a).toMatchObject({ category: "Outras despesas", needsReview: true });
  });

  it("confiança baixa marca revisão e leva a escolhida + alternativas como opções", () => {
    const [a] = validateActions([raw({ confidence: "baixa", alternatives: ["Conhecimento", "Inventada"] })], ctx);
    expect(a).toMatchObject({ needsReview: true, alternatives: ["Ferramentas e plataformas", "Conhecimento"] });
  });

  it("sem valor vira pergunta", () => {
    const [a] = validateActions([raw({ amount: null })], ctx);
    expect(a).toEqual({ action: "clarify", question: "Qual foi o valor?" });
  });

  it("forma de pagamento desconhecida vira null e data inválida vira hoje", () => {
    const [a] = validateActions([raw({ paymentMethod: "bitcoin", date: "31/10" })], ctx);
    expect(a).toMatchObject({ paymentMethod: null, date: "2026-10-16" });
  });

  it("receita liga ao aluno pelo nome parcial, mas não quando é ambíguo", () => {
    const [a, b] = validateActions([
      raw({ kind: "receita", category: "Consultoria anual", clientName: "Aleska", paymentMethod: "Pix C6" }),
      raw({ kind: "receita", category: "Consultoria anual", clientName: "Andressa", paymentMethod: "Pix C6" }),
    ], ctx);
    expect(a).toMatchObject({ clientId: "c1", paymentMethod: "Pix C6" });
    expect(b).toMatchObject({ clientId: null });
  });

  it("settle só com ref de item em aberto", () => {
    const [ok, bad] = validateActions([
      raw({ action: "settle", ref: "tx:cont", amount: 407.29 }),
      raw({ action: "settle", ref: "tx:naoexiste" }),
    ], ctx);
    expect(ok).toEqual({ action: "settle", ref: "tx:cont", amount: 407.29, date: "2026-10-16", paymentMethod: "Pix/débito PJ" });
    expect(bad.action).toBe("clarify");
  });

  it("undo aceita ref recente ou null; recategorize exige ref recente e categoria válida", () => {
    const res = validateActions([
      raw({ action: "undo", ref: "tx:gpt" }),
      raw({ action: "undo", ref: "tx:outro" }),
      raw({ action: "recategorize", ref: "tx:gpt", category: "conhecimento" }),
      raw({ action: "recategorize", ref: "tx:gpt", category: "Nada" }),
    ], ctx);
    expect(res[0]).toEqual({ action: "undo", ref: "tx:gpt" });
    expect(res[1]).toEqual({ action: "undo", ref: null });
    expect(res[2]).toEqual({ action: "recategorize", ref: "tx:gpt", category: "Conhecimento" });
    expect(res[3].action).toBe("clarify");
  });

  it("data impossível vira hoje em create e em settle", () => {
    const [a, b] = validateActions([
      raw({ date: "2026-11-31" }),
      raw({ action: "settle", ref: "tx:cont", date: "2026-13-01" }),
    ], ctx);
    expect(a).toMatchObject({ action: "create", date: "2026-10-16" });
    expect(b).toMatchObject({ action: "settle", date: "2026-10-16" });
  });

  it("clarify usa a pergunta do modelo", () => {
    const [a] = validateActions([raw({ action: "clarify", question: "Foi pix ou cartão?" })], ctx);
    expect(a).toEqual({ action: "clarify", question: "Foi pix ou cartão?" });
  });
});

describe("matchClient", () => {
  it("exato, parcial único, ambíguo e vazio", () => {
    expect(matchClient(ctx.clients, "aleska da rosa eli")).toBe("c1");
    expect(matchClient(ctx.clients, "Milhbeier")).toBe("c3");
    expect(matchClient(ctx.clients, "Andressa")).toBeNull();
    expect(matchClient(ctx.clients, null)).toBeNull();
  });
});

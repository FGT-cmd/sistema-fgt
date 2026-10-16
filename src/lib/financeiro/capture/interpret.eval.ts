import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { categorizeStatementRows, extractPdfStatement, interpret, FINANCE_MODELS } from "./interpret";
import { buildVocab, planSeed, type ConfigRow } from "../vocab";
import type { CaptureContext, CreateAction } from "./types";

// Arquivos reais do Fernando (dados pessoais): ficam fora do git, ver .gitignore.
const FIXTURES = "src/lib/financeiro/__fixtures__";
const RECEIPT = `${FIXTURES}/comprovante.jpg`;
const PDF = `${FIXTURES}/extrato.pdf`;
console.log("[eval] modelos:", FINANCE_MODELS);

const seedRows: ConfigRow[] = planSeed([]).create.map((c, i) => ({
  id: String(i), type: c.type, value: c.value, group: c.group, account: c.account, active: true, order: c.order,
}));
const ctx: CaptureContext = {
  today: "2026-10-16",
  vocab: buildVocab(seedRows),
  openItems: [
    { ref: "tx:cont", kind: "despesa", description: "Contabilidade", category: "Contabilidade", amount: 398, dueDate: "2026-10-10", clientName: null },
    { ref: "inst:i9", kind: "receita", description: "Consultoria anual (2/12)", category: "Venda", amount: 1800, dueDate: "2026-10-10", clientName: "Aleska da Rosa Eli" },
  ],
  recent: [
    { ref: "tx:mfit", kind: "despesa", description: "mfit", category: "Ferramentas e plataformas", amount: 39.9, date: "2026-10-16", needsReview: false },
    { ref: "tx:gpt", kind: "despesa", description: "ChatGPT", category: "Ferramentas e plataformas", amount: 57, date: "2026-10-16", needsReview: true },
  ],
  clients: [{ id: "c1", name: "Aleska da Rosa Eli" }, { id: "c2", name: "Bruna Tavares" }],
};
const first = async (text: string) => (await interpret(ctx, { kind: "text", text }))[0];

describe("interpretação real — capture (gasta API)", () => {
  it("transcrição de voz por extenso", async () => {
    expect(await first("paguei trinta e nove reais de mfit no pix")).toMatchObject({
      action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas",
    });
  });
  it("é conhecimento → recategoriza o recente a revisar", async () => {
    expect(await first("o do chatgpt é conhecimento")).toEqual({ action: "recategorize", ref: "tx:gpt", category: "Conhecimento" });
  });
  it("paguei 39 mfit pix", async () => {
    expect(await first("paguei 39 mfit pix")).toMatchObject({
      action: "create", kind: "despesa", amount: 39, category: "Ferramentas e plataformas", paymentMethod: "Pix/débito PJ", status: "pago",
    });
  });
  it("gastei 39,90 mfit no cartão da natália", async () => {
    expect(await first("gastei 39,90 mfit no cartão da natália")).toMatchObject({
      amount: 39.9, category: "Ferramentas e plataformas", paymentMethod: "Cartão crédito (Natália)",
    });
  });
  it("boleto contadora foi pago → baixa, sem lançamento novo", async () => {
    const actions = await interpret(ctx, { kind: "text", text: "boleto contadora foi pago" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "settle", ref: "tx:cont" });
  });
  it("a contadora já tá paga, deu 407,29 → baixa com valor", async () => {
    expect(await first("a contadora já tá paga, deu 407,29")).toMatchObject({ action: "settle", ref: "tx:cont", amount: 407.29 });
  });
  it("paguei 398 contadora pix → baixa da conta em aberto, não lançamento novo", async () => {
    const actions = await interpret(ctx, { kind: "text", text: "paguei 398 contadora pix" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "settle", ref: "tx:cont" });
  });
  it("a Aleska pagou 1800 no pix → baixa da parcela em aberto", async () => {
    const actions = await interpret(ctx, { kind: "text", text: "a Aleska pagou 1800 no pix" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "settle", ref: "inst:i9" });
  });
  it("recebi 1800 da Aleska anual no C6 → com parcela em aberto, é baixa", async () => {
    const actions = await interpret(ctx, { kind: "text", text: "recebi 1800 da Aleska anual no C6" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "settle", ref: "inst:i9" });
  });
  it("recebi 1800 da Bruna anual no C6 → aluna sem item em aberto, é lançamento novo", async () => {
    expect(await first("recebi 1800 da Bruna anual no C6")).toMatchObject({
      action: "create", kind: "receita", amount: 1800, category: "Consultoria anual", paymentMethod: "Pix C6", clientId: "c2",
    });
  });
  it("vence dia 31 o CREF, 444 → a pagar", async () => {
    expect(await first("vence dia 31 o CREF, 444")).toMatchObject({
      action: "create", kind: "despesa", amount: 444, category: "Outras despesas", status: "pendente", date: "2026-10-31",
    });
  });
  it("chatgpt 57 cartão natália → ambíguo, a revisar", async () => {
    const a = (await first("chatgpt 57 cartão natália")) as CreateAction;
    expect(a).toMatchObject({ action: "create", amount: 57, paymentMethod: "Cartão crédito (Natália)" });
    expect(["Ferramentas e plataformas", "Conhecimento"]).toContain(a.category);
  });
  it("apaga esse do mfit → desfaz o recente", async () => {
    expect(await first("apaga esse do mfit")).toEqual({ action: "undo", ref: "tx:mfit" });
  });
});

describe("interpretação real — document (gasta API, precisa dos arquivos do Fernando)", () => {
  it.skipIf(!existsSync(RECEIPT))("comprovante vira um lançamento com valor", async () => {
    const actions = await interpret(ctx, {
      kind: "image", imageBase64: readFileSync(RECEIPT).toString("base64"), mimeType: "image/jpeg", caption: null,
    });
    const create = actions.find((a) => a.action === "create") as CreateAction | undefined;
    console.log("[eval] comprovante →", create);
    expect(create?.amount).toBeGreaterThan(0);
  });
  it.skipIf(!existsSync(PDF))("extrato em PDF: linhas com data e valor, sem inventar", async () => {
    const parsed = await extractPdfStatement(readFileSync(PDF).toString("base64"));
    console.log("[eval] PDF →", parsed.rows.length, "linhas; primeiras:", parsed.rows.slice(0, 3), "saldo:", parsed.ledgerBalance);
    expect(parsed.rows.length).toBeGreaterThan(0);
    for (const r of parsed.rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.amount).not.toBe(0);
    }
  });
});

describe("interpretação real — categorize (gasta API)", () => {
  it("retirada, gasto pessoal e saque → Prolabore; contabilidade segue como despesa normal", async () => {
    const rows = [
      { date: "2025-10-23", amount: -2000.25, description: "Pix enviado para FERNANDO GOMES DA SILVA", externalId: "t1" },
      { date: "2025-10-24", amount: -12, description: "Pix enviado para Padaria Avenida Tres Passos Ltda", externalId: "t2" },
      { date: "2025-10-13", amount: -100, description: "Saque Digital", externalId: "t3" },
      { date: "2025-10-20", amount: -419.17, description: "CONTAGRO ASSESSORIA CONTABIL LTDA", externalId: "t4" },
    ];
    const { drafts, ignored } = await categorizeStatementRows(ctx, rows, "C6");
    const cat = (id: string) => drafts.find((d) => d.externalId === id)?.category;
    console.log("[eval] categorize →", drafts.map((d) => [d.externalId, d.category]), "ignored:", ignored);
    expect(cat("t1")).toBe("Prolabore");
    expect(cat("t2")).toBe("Prolabore");
    expect(cat("t3")).toBe("Prolabore");
    expect(cat("t4")).toBe("Contabilidade");
    expect(ignored).toBe(0);
  });
});

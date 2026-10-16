import { describe, it, expect } from "vitest";
import { describeDraft, summarizeCapture, statementHeader } from "./summary";
import { emptyResult, type TxDraft } from "./types";

const draft = (p: Partial<TxDraft>): TxDraft => ({
  kind: "despesa", amount: 39.9, category: "Ferramentas e plataformas", description: "mfit",
  paymentMethod: "Cartão crédito (Natália)", date: "2026-10-15", status: "pago", clientId: null,
  needsReview: false, alternatives: [], externalId: null, ...p,
});
const brl = (s: string) => s.replace(/ /g, " ");

describe("summary", () => {
  it("descreve pago, recebido e a pagar", () => {
    expect(brl(describeDraft(draft({})))).toBe("R$ 39,90 · Ferramentas e plataformas · Cartão crédito (Natália) · pago · 15/10");
    expect(brl(describeDraft(draft({ kind: "receita", amount: 1800, category: "Consultoria anual", paymentMethod: "Pix C6" }))))
      .toBe("R$ 1.800,00 · Consultoria anual · Pix C6 · recebido · 15/10");
    expect(brl(describeDraft(draft({ status: "pendente", date: "2026-10-31", paymentMethod: null, category: "Outras despesas", amount: 444 }))))
      .toBe("R$ 444,00 · Outras despesas · a pagar · vence 31/10");
  });

  it("resume tudo que aconteceu numa mensagem", () => {
    const r = emptyResult();
    r.saved = [{ ...draft({}), id: "1" }, { ...draft({ needsReview: true, description: "ChatGPT", amount: 57 }), id: "2" }];
    r.settled = [{ ref: "tx:c", description: "Contabilidade" }];
    r.undone = ["mfit R$ 39,90"];
    r.questions = [{ pendingId: "p", txId: "2", question: "ChatGPT R$ 57,00: é Ferramentas e plataformas ou Conhecimento?", options: [] }];
    r.clarify = ["Qual foi o valor?"];
    const s = brl(summarizeCapture(r));
    expect(s).toContain("✅ R$ 39,90");
    expect(s).toContain("🟡 R$ 57,00");
    expect(s).toContain("✅ Baixa: Contabilidade");
    expect(s).toContain("↩️ Desfeito: mfit R$ 39,90");
    expect(s).toContain("❓ ChatGPT");
    expect(s).toContain("❓ Qual foi o valor?");
  });

  it("propostas mostram cabeçalho e cortam em 15 linhas", () => {
    const r = emptyResult();
    r.proposalHeader = "📷 Entendi do comprovante:";
    r.proposals = Array.from({ length: 17 }, () => draft({}));
    const s = summarizeCapture(r);
    expect(s.startsWith("📷 Entendi do comprovante:")).toBe(true);
    expect(s).toContain("… e mais 2");
  });

  it("nada a dizer", () => {
    expect(summarizeCapture(emptyResult())).toBe("Não registrei nada.");
  });

  it("cabeçalho do extrato", () => {
    expect(statementHeader({ account: "C6", months: ["2026-09"], novos: 32, duplicados: 4, baixas: 2, revisar: 3, ignorados: 1 }))
      .toBe("📎 Extrato C6 · setembro/2026: 32 novos, 4 já existiam, 2 baixas em contas a pagar, 3 sem categoria clara, 1 ignorado (transferências/fatura).");
  });
});

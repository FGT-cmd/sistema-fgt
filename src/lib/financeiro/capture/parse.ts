// Validação da saída do modelo. Nada chega ao banco sem passar por aqui:
// categorias e formas viram os nomes canônicos do vocabulário, refs precisam
// existir, valores precisam ser positivos.

import { matchLabel, normalizeLabel } from "../vocab";
import { round2, isValidIsoDate } from "../dates";
import type {
  CaptureAction, CaptureContext, ClarifyAction, CreateAction, RawAction,
} from "./types";

export function matchClient(clients: { id: string; name: string }[], name: string | null): string | null {
  if (!name || !name.trim()) return null;
  const n = normalizeLabel(name);
  const exact = clients.find((c) => normalizeLabel(c.name) === n);
  if (exact) return exact.id;
  const partial = clients.filter((c) => {
    const cn = normalizeLabel(c.name);
    return cn.includes(n) || n.includes(cn);
  });
  return partial.length === 1 ? partial[0].id : null;
}

function validDate(date: string | null, today: string): string {
  return date && isValidIsoDate(date) ? date : today;
}

export function validateCreate(a: RawAction, ctx: CaptureContext): CreateAction | ClarifyAction {
  if (!a.amount || a.amount <= 0) {
    return { action: "clarify", question: a.question?.trim() || "Qual foi o valor?" };
  }
  const kind = a.kind === "receita" ? "receita" : "despesa";
  const categories = kind === "receita"
    ? ctx.vocab.incomeCategories
    : ctx.vocab.expenseCategories.map((c) => c.name);
  const methods = (kind === "receita" ? ctx.vocab.recvMethods : ctx.vocab.payMethods).map((m) => m.name);

  const matched = matchLabel(categories, a.category);
  const others = (a.alternatives ?? [])
    .map((x) => matchLabel(categories, x))
    .filter((x): x is string => !!x && x !== matched);
  const fallback = kind === "receita"
    ? categories[0] ?? "Receita"
    : matchLabel(categories, "Outras despesas") ?? categories[0] ?? "Outras despesas";
  const category = matched ?? fallback;
  const needsReview = !matched || a.confidence === "baixa";
  const alternatives = needsReview ? [...(matched ? [matched] : []), ...others].slice(0, 3) : [];

  return {
    action: "create",
    kind,
    amount: round2(a.amount),
    category,
    description: (a.description?.trim() || category).slice(0, 120),
    paymentMethod: matchLabel(methods, a.paymentMethod),
    date: validDate(a.date, ctx.today),
    status: a.status === "pendente" ? "pendente" : "pago",
    clientId: kind === "receita" ? matchClient(ctx.clients, a.clientName) : null,
    needsReview,
    alternatives,
    externalId: null,
  };
}

export function validateActions(raw: RawAction[], ctx: CaptureContext): CaptureAction[] {
  const allMethods = [...ctx.vocab.payMethods, ...ctx.vocab.recvMethods].map((m) => m.name);
  const allCategories = [...ctx.vocab.incomeCategories, ...ctx.vocab.expenseCategories.map((c) => c.name)];
  const out: CaptureAction[] = [];

  for (const a of raw) {
    switch (a.action) {
      case "create":
        out.push(validateCreate(a, ctx));
        break;
      case "settle": {
        const ref = a.ref && ctx.openItems.some((i) => i.ref === a.ref) ? a.ref : null;
        if (!ref) {
          out.push({ action: "clarify", question: "Não achei essa conta em aberto. Me diz o valor que eu lanço." });
          break;
        }
        out.push({
          action: "settle",
          ref,
          amount: a.amount && a.amount > 0 ? round2(a.amount) : null,
          date: validDate(a.date, ctx.today),
          paymentMethod: matchLabel(allMethods, a.paymentMethod),
        });
        break;
      }
      case "undo":
        // null = "desfaz o último". Ref desconhecido nunca vira "o último": pergunta.
        if (!a.ref) out.push({ action: "undo", ref: null });
        else if (ctx.recent.some((r) => r.ref === a.ref)) out.push({ action: "undo", ref: a.ref });
        else out.push({ action: "clarify", question: "Qual lançamento você quer desfazer?" });
        break;
      case "recategorize": {
        const category = matchLabel(allCategories, a.category);
        if (a.ref && category && ctx.recent.some((r) => r.ref === a.ref)) {
          out.push({ action: "recategorize", ref: a.ref, category });
        } else {
          out.push({ action: "clarify", question: "Qual lançamento e qual categoria?" });
        }
        break;
      }
      default:
        out.push({ action: "clarify", question: a.question?.trim() || "Não entendi. Pode repetir com o valor?" });
    }
  }
  return out;
}

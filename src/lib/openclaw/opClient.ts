/**
 * Cliente HTTP para o contrato operacional interno /api/op/*.
 * Usado pelo engine para query_pending e create_task — sem Prisma direto nesses fluxos.
 */

import type { OCCreateTaskData, OCEnriched, OCQueryType } from "./types";

function getOpBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

function requireSecret(): string {
  const s = process.env.OP_INTERNAL_SECRET;
  if (!s || !s.trim()) {
    throw new Error("OP_CONFIG_MISSING");
  }
  return s.trim();
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; text?: string };
    if (j?.error && typeof j.error === "string") return j.error;
    if (j?.text && typeof j.text === "string") return j.text;
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
}

/** GET /api/op/pending — texto formatado para o usuário */
export async function opGetPending(userId: string, queryType: OCQueryType): Promise<string> {
  const secret = requireSecret();
  const url = new URL(`${getOpBaseUrl()}/api/op/pending`);
  url.searchParams.set("queryType", queryType);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "x-user-id": userId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readErrorBody(res));
  }

  const body = (await res.json()) as { text?: string };
  if (typeof body.text !== "string") {
    throw new Error("Resposta inválida do serviço de pendências.");
  }
  return body.text;
}

/** POST /api/op/task — mesma string de confirmação que createTask em actions */
export async function opCreateTask(
  data: OCCreateTaskData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  const secret = requireSecret();
  const res = await fetch(`${getOpBaseUrl()}/api/op/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, data, enriched }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readErrorBody(res));
  }

  const body = (await res.json()) as { text?: string };
  if (typeof body.text !== "string") {
    throw new Error("Resposta inválida do serviço de tarefas.");
  }
  return body.text;
}

/** POST /api/op/checkout/create — texto formatado para Telegram */
export async function opCheckoutCreate(payload: {
  productName: string;
  amountCents: number;
  notes?: string;
  source?: string;
}): Promise<string> {
  const secret = requireSecret();
  const res = await fetch(`${getOpBaseUrl()}/api/op/checkout/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productName: payload.productName,
      amountCents: payload.amountCents,
      ...(payload.notes ? { notes: payload.notes } : {}),
      source: payload.source ?? "telegram",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(await readErrorBody(res));
  }

  const body = (await res.json()) as { text?: string };
  if (typeof body.text !== "string") {
    throw new Error("Resposta inválida do serviço de checkout.");
  }
  return body.text;
}

/**
 * Mensagem curta para o usuário final (Telegram etc.) a partir de erros da camada /api/op.
 * Não expõe nomes de variáveis de ambiente. Detalhe técnico continua no log / OpenClawEvent.errorMessage.
 */
export function opLayerUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw === "OP_CONFIG_MISSING" || /serviço operacional não configurado/i.test(raw)) {
    return "O serviço operacional não está configurado no servidor. Avise o responsável técnico.";
  }
  if (/credencial operacional inválida|inválida ou ausente/i.test(raw)) {
    return "Falha de autenticação interna do serviço. Avise o responsável técnico.";
  }
  if (/falha ao consultar pendências/i.test(raw)) {
    return "Não foi possível consultar pendências agora. Tente novamente em instantes.";
  }
  if (/falha ao criar tarefa/i.test(raw)) {
    return "Não foi possível criar a tarefa agora. Tente novamente em instantes.";
  }
  if (/falha ao criar checkout/i.test(raw)) {
    return "Não foi possível gerar o link de checkout agora. Tente novamente em instantes.";
  }
  if (/resposta inválida do serviço de checkout/i.test(raw)) {
    return "Não foi possível gerar o link de checkout agora. Tente novamente em instantes.";
  }
  if (/resposta inválida do serviço|resposta inconsistente/i.test(raw)) {
    return "Resposta inconsistente do serviço operacional. Tente novamente em instantes.";
  }
  if (/cabeçalho x-user-id|queryType inválido|JSON inválido|userId obrigatório|title obrigatório/i.test(raw)) {
    return "Pedido operacional inválido. Avise o responsável técnico.";
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw)) {
    return "Sem conexão com o serviço operacional. Tente novamente em instantes.";
  }
  if (/^HTTP\s(401|403)\b/.test(raw.trim())) {
    return "Falha de autenticação interna do serviço. Avise o responsável técnico.";
  }
  if (/^HTTP\s5\d\d\b/.test(raw.trim())) {
    return "Serviço operacional retornou erro. Tente novamente em instantes.";
  }

  return "Serviço operacional indisponível no momento. Tente novamente em instantes.";
}

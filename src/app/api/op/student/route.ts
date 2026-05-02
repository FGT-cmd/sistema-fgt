import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

type ParsedStudentCommand = {
  name: string;
  planRaw: string | null;
  objective: string | null;
};

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const matrix = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= n; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[m][n];
}

function scoreText(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);

  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.94;

  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  const commonTokens = qTokens.filter((t) => cTokens.includes(t)).length;
  const tokenScore = qTokens.length ? commonTokens / qTokens.length : 0;

  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length) || 1;
  const levScore = 1 - dist / maxLen;

  return tokenScore * 0.6 + levScore * 0.4;
}

function parseStudentCommand(rawText: string): ParsedStudentCommand | { error: string } {
  const text = rawText.trim();
  if (!text) return { error: "Comando vazio." };

  const commandMatch = text.match(
    /^(?:aluna\s+nova|nova\s+aluna|cadastre\s+aluna\s+nova)\s+(.+)$/i,
  );
  if (!commandMatch) {
    return {
      error:
        'Formato inválido. Exemplos: "aluna nova Camila Hepfner plano semestral objetivo emagrecimento" ou "cadastre aluna nova Juliana Souza".',
    };
  }

  let remaining = (commandMatch[1] ?? "").trim();
  if (!remaining) {
    return { error: "Nome da aluna não informado." };
  }

  let objective: string | null = null;
  const objectiveMatch = remaining.match(/\bobjetivo\s+(.+)$/i);
  if (objectiveMatch) {
    objective = (objectiveMatch[1] ?? "").trim() || null;
    remaining = remaining.slice(0, objectiveMatch.index).trim();
  }

  let planRaw: string | null = null;
  const planMatch = remaining.match(/\bplano\s+(.+)$/i);
  if (planMatch) {
    planRaw = (planMatch[1] ?? "").trim() || null;
    remaining = remaining.slice(0, planMatch.index).trim();
  }

  const name = remaining.trim();
  if (!name || name.length < 3) {
    return { error: "Nome da aluna inválido no comando." };
  }

  return { name, planRaw, objective };
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.OP_INTERNAL_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { text: "Serviço operacional não configurado (OP_INTERNAL_SECRET)." },
        { status: 503 },
      );
    }

    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || token !== secret) {
      return NextResponse.json({ text: "Credencial operacional inválida ou ausente." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const rawText = typeof body?.rawText === "string" ? body.rawText : "";
    if (!rawText) {
      return NextResponse.json(
        { text: 'Payload inválido. Envie JSON no formato: { "rawText": "..." }' },
        { status: 400 },
      );
    }

    const parsed = parseStudentCommand(rawText);
    if ("error" in parsed) {
      return NextResponse.json({ text: parsed.error }, { status: 400 });
    }

    const user = await getDefaultUser();

    const existingClients = await prisma.client.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    });

    if (existingClients.length > 0) {
      const rankedClients = existingClients
        .map((client) => ({ client, score: scoreText(parsed.name, client.name) }))
        .sort((a, b) => b.score - a.score);

      const best = rankedClients[0];
      const second = rankedClients[1];

      const STRONG_DUPLICATE_SCORE = 0.9;
      const AMBIGUOUS_SCORE = 0.84;
      const AMBIGUOUS_GAP = 0.05;

      if (best && best.score >= STRONG_DUPLICATE_SCORE) {
        return NextResponse.json(
          { text: `Possível duplicidade: já existe aluna muito parecida (${best.client.name}).` },
          { status: 409 },
        );
      }

      if (best && second && best.score >= AMBIGUOUS_SCORE && best.score - second.score < AMBIGUOUS_GAP) {
        return NextResponse.json(
          {
            text: `Ambiguidade ao validar duplicidade para "${parsed.name}". Possíveis alunas: ${best.client.name} e ${second.client.name}.`,
          },
          { status: 409 },
        );
      }
    }

    let matchedPlan: { id: string; name: string } | null = null;
    if (parsed.planRaw) {
      const plans = await prisma.servicePlan.findMany({
        where: { userId: user.id, active: true },
        select: { id: true, name: true },
      });

      if (plans.length === 0) {
        return NextResponse.json(
          { text: `Nenhum plano ativo encontrado para conciliar "${parsed.planRaw}".` },
          { status: 409 },
        );
      }

      const rankedPlans = plans
        .map((plan) => ({ plan, score: scoreText(parsed.planRaw as string, plan.name) }))
        .sort((a, b) => b.score - a.score);

      const bestPlan = rankedPlans[0];
      const secondPlan = rankedPlans[1];
      const PLAN_MIN_SCORE = 0.78;
      const PLAN_MIN_GAP = 0.07;

      if (!bestPlan || bestPlan.score < PLAN_MIN_SCORE) {
        return NextResponse.json(
          { text: `Não encontrei plano compatível com "${parsed.planRaw}".` },
          { status: 409 },
        );
      }

      if (secondPlan && bestPlan.score - secondPlan.score < PLAN_MIN_GAP) {
        return NextResponse.json(
          {
            text: `Ambiguidade no plano "${parsed.planRaw}". Possíveis planos: ${bestPlan.plan.name} e ${secondPlan.plan.name}.`,
          },
          { status: 409 },
        );
      }

      matchedPlan = bestPlan.plan;
    }

    const created = await prisma.client.create({
      data: {
        name: parsed.name,
        status: "ativo",
        source: "op_student",
        planName: matchedPlan?.name ?? parsed.planRaw ?? null,
        planDetails: matchedPlan ? `Plano conciliado automaticamente: ${matchedPlan.name}` : null,
        notes: parsed.objective ? `Objetivo: ${parsed.objective}` : null,
        userId: user.id,
      },
    });

    return NextResponse.json({
      text: `✅ Aluna criada com sucesso: ${created.name}${matchedPlan ? ` (plano: ${matchedPlan.name})` : ""}${parsed.objective ? ` | objetivo: ${parsed.objective}` : ""}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha ao criar aluna: ${msg}` }, { status: 500 });
  }
}

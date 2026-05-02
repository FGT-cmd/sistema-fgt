import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

type ParsedNoteCommand = {
  studentName: string;
  noteText: string;
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

function scoreName(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);

  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.93;

  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  const commonTokens = qTokens.filter((t) => cTokens.includes(t)).length;
  const tokenScore = qTokens.length ? commonTokens / qTokens.length : 0;

  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length) || 1;
  const levScore = 1 - dist / maxLen;

  return tokenScore * 0.6 + levScore * 0.4;
}

function parseNoteCommand(rawText: string): ParsedNoteCommand | { error: string } {
  const text = rawText.trim();
  if (!text) return { error: "Comando vazio." };

  const patternObservacao = /^observa[cç][aã]o\s+(.+?)\s*:\s*(.+)$/i;
  const matchObservacao = text.match(patternObservacao);
  if (matchObservacao) {
    const studentName = (matchObservacao[1] ?? "").trim();
    const noteText = (matchObservacao[2] ?? "").trim();
    if (studentName.length < 3) return { error: "Nome da aluna inválido no comando." };
    if (noteText.length < 3) return { error: "Texto da observação inválido." };
    return { studentName, noteText };
  }

  const normalized = normalizeText(text);
  const prefixes = ["anota na ", "salva observacao para ", "salva observação para "];

  for (const prefix of prefixes) {
    if (!normalized.startsWith(prefix)) continue;
    const originalAfterPrefix = text.slice(prefix.length);
    const separator = normalizeText(originalAfterPrefix).indexOf(" que ");
    if (separator < 1) {
      return {
        error: 'Formato inválido. Use "anota na NOME que OBSERVAÇÃO".',
      };
    }

    const rawName = originalAfterPrefix.slice(0, separator).trim();
    const rawNote = originalAfterPrefix.slice(separator + 5).trim();
    if (rawName.length < 3) return { error: "Nome da aluna inválido no comando." };
    if (rawNote.length < 3) return { error: "Texto da observação inválido." };
    return { studentName: rawName, noteText: rawNote };
  }

  return {
    error:
      'Formato inválido. Exemplos: "observação Camila Hepfner: ...", "anota na Camila que ...", "salva observação para Agatha Amaral: ...".',
  };
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

    const parsed = parseNoteCommand(rawText);
    if ("error" in parsed) {
      return NextResponse.json({ text: parsed.error }, { status: 400 });
    }

    const user = await getDefaultUser();
    const clients = await prisma.client.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    });

    if (clients.length === 0) {
      return NextResponse.json({ text: "Nenhuma aluna cadastrada." }, { status: 404 });
    }

    const ranked = clients
      .map((client) => ({ client, score: scoreName(parsed.studentName, client.name) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];
    const MIN_SCORE = 0.82;
    const MIN_GAP = 0.08;

    if (!best || best.score < MIN_SCORE) {
      return NextResponse.json(
        { text: `Não encontrei aluna compatível com "${parsed.studentName}".` },
        { status: 404 },
      );
    }

    if (second && best.score - second.score < MIN_GAP) {
      return NextResponse.json(
        {
          text: `Ambiguidade no nome "${parsed.studentName}". Possíveis alunas: ${best.client.name} e ${second.client.name}.`,
        },
        { status: 409 },
      );
    }

    await prisma.interaction.create({
      data: {
        type: "observacao_op",
        content: parsed.noteText,
        clientId: best.client.id,
        userId: user.id,
      },
    });

    return NextResponse.json({
      text: `✅ Observação salva para ${best.client.name}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return NextResponse.json({ text: `Falha ao salvar observação: ${msg}` }, { status: 500 });
  }
}

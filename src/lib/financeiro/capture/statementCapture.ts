// Extrato/fatura → propostas aguardando confirmação. Nada é gravado aqui.

import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import {
  decodeStatementText, detectAccount, parseCsv, parseOfx, toStatementRows, type ParsedStatement,
} from "../statement";
import { dedupeRows } from "../dedupe";
import { categorizeStatementRows, extractPdfStatement } from "./interpret";
import { loadCaptureContext } from "./context";
import { stageProposals } from "./apply";
import { statementHeader, summarizeCapture } from "./summary";
import { emptyResult, type CaptureResult, type SettleProposal } from "./types";

const UNREADABLE = "Não consegui ler esse arquivo. Me manda o extrato em OFX ou CSV (no app do banco: Extrato → Exportar).";

function clarifyResult(msg: string): CaptureResult {
  const r = emptyResult();
  r.clarify.push(msg);
  r.summary = summarizeCapture(r);
  return r;
}

export async function captureStatementFile(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<CaptureResult> {
  const user = await getDefaultUser();
  const { ctx, ledger } = await loadCaptureContext(user.id);

  const isPdf = input.mimeType === "application/pdf" || /\.pdf$/i.test(input.fileName);
  let parsed: ParsedStatement;
  let text = "";
  try {
    if (isPdf) {
      parsed = await extractPdfStatement(input.fileBase64);
    } else {
      text = decodeStatementText(input.fileBase64);
      parsed = /OFXHEADER|<OFX>/i.test(text) ? parseOfx(text) : parseCsv(text);
    }
  } catch (err) {
    console.error("[finance/statement] parse", err);
    return clarifyResult(UNREADABLE);
  }
  if (parsed.rows.length === 0) return clarifyResult(UNREADABLE);

  const account = detectAccount(input.fileName, text) ?? "Desconhecida";
  const rows = toStatementRows(parsed, account);
  const known = new Set(
    (await prisma.financialTx.findMany({
      where: { externalId: { in: rows.map((r) => r.externalId) } },
      select: { externalId: true },
    })).map((t) => t.externalId).filter((x): x is string => !!x),
  );

  const verdicts = dedupeRows(rows, ledger, known);
  const newRows = verdicts.filter((v) => v.result.verdict === "new").map((v) => v.row);
  const duplicados = verdicts.filter((v) => v.result.verdict === "duplicate").length;
  const settles: SettleProposal[] = verdicts.flatMap((v) =>
    v.result.verdict === "settles"
      ? [{
          ref: v.result.ref,
          date: v.row.date,
          amount: Math.abs(v.row.amount),
          paymentMethod: null,
          description: ledger.find((e) => e.ref === (v.result as { ref: string }).ref)?.description ?? v.result.ref,
        }]
      : [],
  );

  const { drafts, ignored } = newRows.length
    ? await categorizeStatementRows(ctx, newRows, account)
    : { drafts: [], ignored: 0 };

  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  const header = statementHeader({
    account, months, novos: drafts.length, duplicados, baixas: settles.length,
    revisar: drafts.filter((d) => d.needsReview).length, ignorados: ignored,
  });
  const snapshot = parsed.ledgerBalance && !parsed.isCard && account !== "Desconhecida"
    ? { account, balance: parsed.ledgerBalance.amount, asOf: parsed.ledgerBalance.date }
    : null;

  const result = emptyResult();
  if (!drafts.length && !settles.length && !snapshot) {
    result.summary = `${header}\nNada novo pra lançar.`;
    return result;
  }

  result.pendingConfirmationId = await stageProposals({
    drafts, settles, source: "extrato", rawInput: input.fileName, snapshot, header,
  });
  result.proposals = drafts;
  result.proposalSettles = settles;
  result.proposalSource = "extrato";
  result.proposalHeader = header;
  result.summary = summarizeCapture(result);
  if (account === "Desconhecida") {
    result.summary += "\n⚠️ Não reconheci o banco pelo arquivo; os lançamentos vão sem conta definida.";
  }
  return result;
}

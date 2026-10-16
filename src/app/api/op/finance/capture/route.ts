import { NextRequest, NextResponse } from "next/server";
import { isOpAuthorized } from "@/lib/opAuth";
import { captureImage, captureText } from "@/lib/financeiro/capture/run";
import { captureStatementFile } from "@/lib/financeiro/capture/statementCapture";
import type { ImageMime } from "@/lib/financeiro/capture/interpret";
import type { Channel } from "@/lib/financeiro/capture/types";

export const maxDuration = 300;

const IMAGE_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  if (!isOpAuthorized(req)) {
    return NextResponse.json({ text: "Não autorizado." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const channel: Channel = body?.channel === "jarvis" ? "jarvis" : body?.channel === "painel" ? "painel" : "telegram";

  try {
    let result;
    if (body?.kind === "text" && typeof body.text === "string" && body.text.trim()) {
      result = await captureText(body.text.trim(), channel);
    } else if (body?.kind === "image" && typeof body.imageBase64 === "string" && IMAGE_MIMES.includes(body.mimeType)) {
      result = await captureImage(body.imageBase64, body.mimeType, typeof body.caption === "string" ? body.caption : null, channel);
    } else if (body?.kind === "file" && typeof body.fileBase64 === "string" && typeof body.fileName === "string") {
      result = await captureStatementFile({ fileBase64: body.fileBase64, fileName: body.fileName, mimeType: String(body.mimeType ?? "") });
    } else {
      return NextResponse.json(
        { text: 'Payload inválido. Envie { "kind": "text", "text": "..." }.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ...result, text: result.summary });
  } catch (err) {
    console.error("[POST /api/op/finance/capture]", err);
    const msg = err instanceof Error ? err.message : "erro inesperado";
    return NextResponse.json({ text: `Falha ao registrar no financeiro: ${msg}` }, { status: 500 });
  }
}

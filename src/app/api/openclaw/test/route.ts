// Endpoint de teste local — simula mensagem sem Telegram
import { NextRequest, NextResponse } from "next/server";
import { processOpenClawMessage } from "@/lib/openclaw/engine";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message: string = body.message || "";
  const chatId: string = body.chatId || "test-ui";

  if (!message.trim()) {
    return NextResponse.json({ response: "Mensagem vazia." });
  }

  const result = await processOpenClawMessage({ chatId, message, source: "test" });
  return NextResponse.json(result);
}

// Endpoint de teste local — não exige autenticação WhatsApp, sem áudio/imagem
// Simula o mesmo pipeline do webhook com phone fixo "test-ui"

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message: string = body.message || "";
  const phone: string = body.phone || "test-ui";

  if (!message.trim()) {
    return NextResponse.json({ response: "Mensagem vazia." });
  }

  // Repassa para o webhook principal com header de autenticação interno
  const baseUrl = req.nextUrl.origin;
  const res = await fetch(`${baseUrl}/api/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-whatsapp-secret": process.env.WHATSAPP_SECRET || "",
    },
    body: JSON.stringify({ phone, message, messageType: "text" }),
  });

  const data = await res.json();
  return NextResponse.json(data);
}

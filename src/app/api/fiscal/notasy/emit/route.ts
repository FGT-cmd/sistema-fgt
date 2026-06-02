import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildNotasyPayload, emitNotasyInvoice } from "@/lib/notasy";

export async function POST(req: NextRequest) {
  let body: { invoiceIssueId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { invoiceIssueId } = body;
  if (!invoiceIssueId) {
    return NextResponse.json({ error: "invoiceIssueId é obrigatório" }, { status: 400 });
  }

  const invoice = await prisma.invoiceIssue.findUnique({
    where: { id: invoiceIssueId },
    include: { client: true, sale: true, checkoutSession: true, financialTx: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "InvoiceIssue não encontrado" }, { status: 404 });
  }

  if (invoice.status === "issued") {
    return NextResponse.json(
      { error: "Nota já emitida — emissão duplicada impedida" },
      { status: 409 }
    );
  }

  if (invoice.status !== "ready" && invoice.status !== "error" && invoice.status !== "sent") {
    return NextResponse.json(
      { error: `Emissão não permitida no status atual: ${invoice.status}` },
      { status: 422 }
    );
  }

  await prisma.invoiceIssue.update({
    where: { id: invoiceIssueId },
    data: { status: "sending", errorMessage: null },
  });

  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = buildNotasyPayload(invoice);
  } catch (validationErr) {
    const message = validationErr instanceof Error ? validationErr.message : String(validationErr);
    const updated = await prisma.invoiceIssue.update({
      where: { id: invoiceIssueId },
      data: {
        status: "error",
        externalProvider: "notasy",
        errorMessage: message,
        rawPayload: Prisma.JsonNull,
        rawResponse: Prisma.JsonNull,
        sentAt: new Date(),
      },
    });
    return NextResponse.json({ error: message, invoice: updated }, { status: 422 });
  }

  try {
    const result = await emitNotasyInvoice(invoice);

    const isIssued = result.status === "issued";
    const updated = await prisma.invoiceIssue.update({
      where: { id: invoiceIssueId },
      data: {
        status: result.status,
        externalProvider: "notasy",
        invoiceNumber: result.invoiceNumber ?? null,
        pdfUrl: result.pdfUrl ?? null,
        xmlUrl: result.xmlUrl ?? null,
        rawPayload: rawPayload as Prisma.InputJsonValue,
        rawResponse: result.rawResponse as Prisma.InputJsonValue,
        errorMessage: null,
        sentAt: new Date(),
        ...(isIssued && { issuedAt: new Date() }),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errAny = err as { rawPayload?: unknown; rawResponse?: unknown };

    const updated = await prisma.invoiceIssue.update({
      where: { id: invoiceIssueId },
      data: {
        status: "error",
        externalProvider: "notasy",
        errorMessage: message,
        rawPayload: (errAny.rawPayload ?? rawPayload) as Prisma.InputJsonValue,
        rawResponse: errAny.rawResponse != null
          ? errAny.rawResponse as Prisma.InputJsonValue
          : Prisma.JsonNull,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ error: message, invoice: updated }, { status: 502 });
  }
}

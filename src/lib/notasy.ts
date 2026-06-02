type InvoiceIssueForNotasy = {
  id: string;
  createdAt: Date;
  amount: number;
  taxpayerCpfCnpj?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZipCode?: string | null;
  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    cpf?: string | null;
  };
  sale?: {
    id: string;
    description: string;
    totalAmount: number;
    servicePlanId?: string | null;
    netValue?: number | null;
  } | null;
  financialTx?: {
    paidAt?: Date | null;
  } | null;
};

export type NotasyEmitResult = {
  invoiceNumber: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  status: "sent" | "issued";
  rawResponse: unknown;
};

function getWebhookEndpoint(): string {
  const endpoint = process.env.NOTASY_WEBHOOK_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "Integração Notasy não configurada. Configure NOTASY_WEBHOOK_ENDPOINT com o endpoint da integração API gerado na Notasy."
    );
  }
  return endpoint;
}

function digitsOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits || undefined;
}

export function buildNotasyPayload(invoice: InvoiceIssueForNotasy): Record<string, unknown> {
  const cpf = digitsOnly(invoice.client.cpf ?? invoice.taxpayerCpfCnpj);
  if (!cpf) {
    throw new Error("CPF/CNPJ obrigatório para enviar à Notasy.");
  }

  const saleId = invoice.sale?.id ?? invoice.id;
  const paidAt = (invoice.financialTx?.paidAt ?? invoice.createdAt).toISOString();

  const productId = invoice.sale?.servicePlanId ?? "consultoria-fgt";
  const productName = invoice.sale?.description ?? "Consultoria FGT";
  const offerId =
    productName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "oferta-fgt";

  const priceValue = invoice.sale?.netValue ?? invoice.amount;
  const price = Math.round(priceValue * 100);

  const phone = digitsOnly(invoice.client.phone);

  const customer: Record<string, unknown> = {
    name: invoice.client.name,
    ...(invoice.client.email && { email: invoice.client.email }),
    cpf,
    ...(phone && { phone }),
  };

  const hasFullAddress =
    invoice.addressStreet &&
    invoice.addressNumber &&
    invoice.addressNeighborhood &&
    invoice.addressCity &&
    invoice.addressState &&
    invoice.addressZipCode;

  if (hasFullAddress) {
    customer.address = {
      address: invoice.addressStreet,
      address_number: invoice.addressNumber,
      district: invoice.addressNeighborhood,
      city: invoice.addressCity,
      uf: invoice.addressState,
      zipcode: invoice.addressZipCode,
    };
  }

  return {
    event: "order_approved",
    data: {
      sale: {
        id: saleId,
        paid_at: paidAt,
      },
      items: [
        {
          product_id: productId,
          offer_id: offerId,
          product_name: productName,
          offer_name: productName,
          price,
          currency: "BRL",
          quantity: 1,
        },
      ],
      customer,
    },
  };
}

export async function emitNotasyInvoice(invoice: InvoiceIssueForNotasy): Promise<NotasyEmitResult> {
  const endpoint = getWebhookEndpoint();
  const payload = buildNotasyPayload(invoice);

  let rawResponse: unknown;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    rawResponse = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(`Notasy retornou ${res.status}: ${JSON.stringify(rawResponse)}`);
    }

    const data = (rawResponse ?? {}) as Record<string, unknown>;
    const invoiceNumber = data.invoiceNumber != null ? String(data.invoiceNumber) : null;
    const pdfUrl = data.pdfUrl != null ? String(data.pdfUrl) : null;
    const xmlUrl = data.xmlUrl != null ? String(data.xmlUrl) : null;
    const status: "sent" | "issued" = invoiceNumber || pdfUrl || xmlUrl ? "issued" : "sent";

    return { invoiceNumber, pdfUrl, xmlUrl, status, rawResponse };
  } catch (err) {
    throw Object.assign(
      err instanceof Error ? err : new Error(String(err)),
      { rawPayload: payload, rawResponse }
    );
  }
}

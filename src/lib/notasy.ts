// TODO NOTASY DOCS: Verificar URL base, formato do header de autenticação e paths dos endpoints

type InvoiceIssueForNotasy = {
  id: string;
  serviceDescription: string;
  amount: number;
  taxpayerName: string;
  taxpayerCpfCnpj?: string | null;
  taxpayerEmail?: string | null;
  taxpayerPhone?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZipCode?: string | null;
  documentType: string;
  client: { name: string; email?: string | null };
  sale?: { id: string; description: string; totalAmount: number } | null;
};

export type NotasyEmitResult = {
  externalId: string;
  invoiceNumber: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  status: string;
  rawResponse: unknown;
};

function getEnvs() {
  const baseUrl = process.env.NOTASY_API_BASE_URL;
  const token = process.env.NOTASY_API_TOKEN;

  if (!baseUrl) throw new Error("NOTASY_API_BASE_URL não configurada");
  if (!token) throw new Error("NOTASY_API_TOKEN não configurada");

  return { baseUrl, token };
}

export function buildNotasyPayload(invoice: InvoiceIssueForNotasy): Record<string, unknown> {
  const serviceCode = process.env.NOTASY_SERVICE_CODE;
  const cityCode = process.env.NOTASY_CITY_CODE;
  const taxRate = process.env.NOTASY_TAX_RATE ? parseFloat(process.env.NOTASY_TAX_RATE) : undefined;
  const companyDocument = process.env.NOTASY_COMPANY_DOCUMENT;

  // TODO NOTASY DOCS: Ajustar nomes dos campos de acordo com a spec da API Notasy
  return {
    servico: {
      descricao: invoice.serviceDescription,
      valor: invoice.amount,
      ...(serviceCode && { codigoServico: serviceCode }),
      ...(cityCode && { codigoCidade: cityCode }),
      ...(taxRate !== undefined && { aliquota: taxRate }),
    },
    tomador: {
      nome: invoice.taxpayerName,
      ...(invoice.taxpayerCpfCnpj && { cpfCnpj: invoice.taxpayerCpfCnpj }),
      ...(invoice.taxpayerEmail && { email: invoice.taxpayerEmail }),
      ...(invoice.taxpayerPhone && { telefone: invoice.taxpayerPhone }),
      endereco: {
        ...(invoice.addressStreet && { logradouro: invoice.addressStreet }),
        ...(invoice.addressNumber && { numero: invoice.addressNumber }),
        ...(invoice.addressNeighborhood && { bairro: invoice.addressNeighborhood }),
        ...(invoice.addressCity && { cidade: invoice.addressCity }),
        ...(invoice.addressState && { estado: invoice.addressState }),
        ...(invoice.addressZipCode && { cep: invoice.addressZipCode }),
      },
    },
    ...(companyDocument && { prestador: { cpfCnpj: companyDocument } }),
  };
}

export async function emitNotasyInvoice(invoice: InvoiceIssueForNotasy): Promise<NotasyEmitResult> {
  const { baseUrl, token } = getEnvs();
  const payload = buildNotasyPayload(invoice);

  // TODO NOTASY DOCS: Confirmar o path correto do endpoint de emissão de NFS-e
  const endpoint = `${baseUrl}/nfse/emitir`;

  let rawResponse: unknown;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // TODO NOTASY DOCS: Confirmar formato do header de autorização (Bearer, Basic, ou header customizado)
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    rawResponse = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(`Notasy retornou ${res.status}: ${JSON.stringify(rawResponse)}`);
    }

    // TODO NOTASY DOCS: Ajustar campos do retorno conforme spec (id, numero, urlPdf, urlXml, status)
    const data = rawResponse as Record<string, unknown>;
    return {
      externalId: String(data.id ?? data.externalId ?? ""),
      invoiceNumber: data.numero != null ? String(data.numero) : null,
      pdfUrl: data.urlPdf != null ? String(data.urlPdf) : null,
      xmlUrl: data.urlXml != null ? String(data.urlXml) : null,
      status: String(data.status ?? "sent"),
      rawResponse,
    };
  } catch (err) {
    throw Object.assign(
      err instanceof Error ? err : new Error(String(err)),
      { rawPayload: payload, rawResponse }
    );
  }
}

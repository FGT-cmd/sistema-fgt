/**
 * Parser determinístico para comandos de checkout via Telegram (OpenClaw).
 * Ex.: "gera link anual 2400" → FGSQUAD Anual + valor em centavos.
 */

function normalizeKeyword(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export type TelegramCheckoutLinkCommand = {
  productName: string;
  amountCents: number;
};

/** Ex.: "gera link anual 2400" / "gerar link trimestral 699" */
export function parseTelegramCheckoutLinkCommand(
  raw: string,
): TelegramCheckoutLinkCommand | null {
  const m = raw.match(/^\s*gera(?:r)?\s+link\s+(.+?)\s*$/i);
  if (!m) return null;

  const rest = (m[1] ?? "").trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const priceStr = parts[parts.length - 1] ?? "";
  if (!/^\d+$/.test(priceStr)) return null;

  const reais = Number.parseInt(priceStr, 10);
  if (!Number.isFinite(reais) || reais < 1) return null;

  const titleRaw = parts.slice(0, -1).join(" ").trim();
  if (!titleRaw) return null;

  const kw = normalizeKeyword(titleRaw);
  let productName = titleRaw;
  if (kw === "anual") productName = "FGSQUAD Anual";
  else if (kw === "semestral") productName = "FGSQUAD Semestral";
  else if (kw === "trimestral") productName = "FGSQUAD Trimestral";

  return { productName, amountCents: reais * 100 };
}

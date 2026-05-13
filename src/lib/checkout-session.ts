import { randomBytes } from "crypto";

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_LEN = 10;

export function generateCheckoutToken(): string {
  const buf = randomBytes(TOKEN_LEN);
  let out = "";
  for (let i = 0; i < TOKEN_LEN; i += 1) {
    out += TOKEN_ALPHABET[buf[i]! % TOKEN_ALPHABET.length];
  }
  return out;
}

export function formatAmountBrl(amountCents: number): string {
  return (amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Base URL pública (sem barra final). */
export function getPublicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** CPF: 11 dígitos, não todos iguais. */
export function isValidCpfDigits(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  return true;
}

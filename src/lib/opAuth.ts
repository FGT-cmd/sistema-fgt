import type { NextRequest } from "next/server";

// Mesmo contrato das rotas /api/op/* existentes: Bearer OP_INTERNAL_SECRET.
export function isOpAuthorized(req: NextRequest): boolean {
  const secret = process.env.OP_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const [scheme, token] = (req.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token === secret;
}

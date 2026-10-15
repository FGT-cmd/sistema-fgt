import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Autenticação HTTP Basic pra todo o app, exceto as rotas que precisam
 * ficar públicas por design (webhooks externos e checkout do cliente).
 *
 * Fail-closed: se BASIC_AUTH_USER/BASIC_AUTH_PASSWORD não estiverem
 * configurados, tudo que não é público fica bloqueado (nunca libera por omissão).
 */

function isPublicPath(pathname: string): boolean {
  if (pathname === "/api/telegram") return true;
  if (pathname === "/api/whatsapp") return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  if (pathname.startsWith("/api/op/")) return true; // já protegido pelo próprio OP_INTERNAL_SECRET
  if (pathname.startsWith("/checkout/")) return true;
  return false;
}

function unauthorized(): NextResponse {
  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sistema FGT"' },
  });
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compara contra si mesmo pra não vazar diferença de tamanho por timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  } catch {
    return unauthorized();
  }

  const sepIndex = decoded.indexOf(":");
  const providedUser = sepIndex >= 0 ? decoded.slice(0, sepIndex) : decoded;
  const providedPass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : "";

  if (!safeCompare(providedUser, expectedUser) || !safeCompare(providedPass, expectedPass)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

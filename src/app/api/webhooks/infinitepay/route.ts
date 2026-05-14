import { NextRequest, NextResponse } from "next/server";
import {
  processInfinitePayWebhook,
  type InfinitePayWebhookBody,
} from "@/lib/infinitepay-webhook";

function authorize(req: NextRequest): boolean {
  const secret = process.env.INFINITEPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const header =
    req.headers.get("x-infinitepay-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    (req.headers.get("authorization")?.startsWith("Bearer ")
      ? req.headers.get("authorization")!.slice(7).trim()
      : null);
  return header === secret;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorize(req)) {
      return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as InfinitePayWebhookBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, message: "invalid_json" }, { status: 400 });
    }

    const result = await processInfinitePayWebhook(body);

    if (result.kind === "error") {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.httpStatus },
      );
    }

    if (result.kind === "ignored") {
      return NextResponse.json({ ok: true, ignored: true, reason: result.reason });
    }

    return NextResponse.json({
      ok: true,
      ...(result.idempotent ? { idempotent: true } : {}),
    });
  } catch (err) {
    console.error("[POST /api/webhooks/infinitepay]", err);
    return NextResponse.json({ ok: false, message: "internal_error" }, { status: 500 });
  }
}

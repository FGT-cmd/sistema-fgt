import { NextRequest, NextResponse } from "next/server";
import { listEvents, createEvent } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeMin = searchParams.get("timeMin") ?? new Date().toISOString();
    const timeMax = searchParams.get("timeMax") ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const events = await listEvents(timeMin, timeMax);
    return NextResponse.json(events);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = await createEvent({
      summary:     body.summary,
      description: body.description,
      start:       body.start,
      end:         body.end,
      colorId:     body.colorId,
    });
    if (!event) return NextResponse.json({ error: "Falha ao criar evento" }, { status: 500 });
    return NextResponse.json(event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

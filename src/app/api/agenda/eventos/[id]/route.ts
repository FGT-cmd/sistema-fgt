import { NextRequest, NextResponse } from "next/server";
import { deleteEvent } from "@/lib/google-calendar";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ok = await deleteEvent(id);
    if (!ok) return NextResponse.json({ error: "Falha ao excluir" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

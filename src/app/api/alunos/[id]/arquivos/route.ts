import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const files = await prisma.studentFile.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(files);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "outro";

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    let url = "";

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`alunos/${id}/${Date.now()}-${file.name}`, file, { access: "public" });
      url = blob.url;
    } else {
      // Fallback: base64 para arquivos até 4MB
      if (file.size > 4 * 1024 * 1024) {
        return NextResponse.json({ error: "Configure BLOB_READ_WRITE_TOKEN no Vercel para uploads maiores que 4MB." }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const b64 = Buffer.from(bytes).toString("base64");
      url = `data:${file.type};base64,${b64}`;
    }

    const record = await prisma.studentFile.create({
      data: { name: file.name, url, fileType: file.type, category, size: file.size, clientId: id },
    });

    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params;
    const fileId = new URL(req.url).searchParams.get("fileId");
    if (!fileId) return NextResponse.json({ error: "fileId obrigatório" }, { status: 400 });
    await prisma.studentFile.delete({ where: { id: fileId, clientId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const files = await prisma.studentFile.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/alunos/[id]/arquivos GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) || "outro";

  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(process.cwd(), "public", "uploads", id);
  await mkdir(uploadDir, { recursive: true });

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(uploadDir, safeName);
  await writeFile(filePath, buffer);

  const record = await prisma.studentFile.create({
    data: {
      name: file.name,
      url: `/uploads/${id}/${safeName}`,
      fileType: file.type,
      category,
      size: file.size,
      clientId: id,
    },
  });

  return NextResponse.json(record);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "fileId obrigatório" }, { status: 400 });

  await prisma.studentFile.delete({ where: { id: fileId, clientId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const existing = await prisma.user.findUnique({ where: { email: "fgt.consultorias@gmail.com" } });
  if (existing) return NextResponse.json(existing);

  const user = await prisma.user.create({
    data: {
      name: "Fernando Gomes",
      email: "fgt.consultorias@gmail.com",
    },
  });

  return NextResponse.json(user);
}

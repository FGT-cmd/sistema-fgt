import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

const AUTOMATION_SECRET = process.env.WHATSAPP_SECRET;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-automation-secret");
  if (AUTOMATION_SECRET && secret !== AUTOMATION_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = await getDefaultUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Busca transações vencidas que não estão pagas ou canceladas
  const vencidas = await prisma.financialTx.findMany({
    where: {
      status: { in: ["pendente", "previsto"] },
      dueDate: { lt: today },
    },
    include: { client: { select: { name: true } } },
  });

  let atualizadas = 0;
  let tarefasCriadas = 0;

  for (const tx of vencidas) {
    // Atualiza status para atrasado
    await prisma.financialTx.update({
      where: { id: tx.id },
      data: { status: "atrasado" },
    });
    atualizadas++;

    // Verifica se já existe tarefa para essa transação
    const tituloTarefa = `Cobrar: ${tx.description}`;
    const jaExiste = await prisma.todoTask.findFirst({
      where: {
        userId: user.id,
        title: tituloTarefa,
        status: "pending",
      },
    });

    if (!jaExiste) {
      await prisma.todoTask.create({
        data: {
          title: tituloTarefa,
          description: `Valor: R$${tx.amount.toFixed(2)} · Venceu em: ${tx.dueDate?.toISOString().slice(0, 10)} · ${tx.client ? `Aluno: ${tx.client.name}` : ""}`.trim(),
          dueDate: new Date(),
          type: "financial",
          source: "automatic",
          status: "pending",
          urgent: true,
          important: true,
          userId: user.id,
          clientId: tx.clientId || null,
        },
      });
      tarefasCriadas++;
    }
  }

  // 2. Restaura status de transações que foram pagas mas ainda estão como "atrasado"
  await prisma.financialTx.updateMany({
    where: { status: "atrasado", paidAt: { not: null } },
    data: { status: "pago" },
  });

  return NextResponse.json({
    ok: true,
    vencidas: vencidas.length,
    atualizadas,
    tarefasCriadas,
    executadoEm: new Date().toISOString(),
  });
}

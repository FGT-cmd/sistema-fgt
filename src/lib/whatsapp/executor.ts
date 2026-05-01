import { prisma } from "@/lib/prisma";
import type {
  Intent, ExtractedData, CreateTaskData, RegisterPaymentData,
  QueryPendingData, CreateExpenseData, MarkPaidData,
} from "./types";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

// ─── Enriquece dados antes de pedir confirmação ───────────────────

export async function enrichBeforeConfirm(
  action: Intent,
  data: ExtractedData,
  userId: string,
) {
  if (action === "create_task") {
    const d = data as CreateTaskData;
    if (!d.studentName) return { valid: true, enriched: {} };

    const clients = await prisma.client.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const matches = findClientMatches(d.studentName, clients);

    if (matches.length === 0) {
      return {
        valid: false,
        message: `Não encontrei nenhum aluno com o nome "${d.studentName}". Vou criar a tarefa sem vínculo. Confirmar?\n\n• *${d.title}*${d.dueDate ? `\n• Data: ${fmtDate(d.dueDate)}` : ""}`,
        enriched: {},
      };
    }

    const best = matches[0];
    if (matches.length > 1) {
      const list = matches.slice(0, 4).map((c, i) => `${i + 1}. ${c.name}`).join("\n");
      return {
        valid: false,
        message: `Encontrei mais de um aluno com esse nome. Qual deles?\n${list}\n\nResponda com o número ou repita a mensagem com o nome completo.`,
        enriched: {},
      };
    }

    return { valid: true, enriched: { clientId: best.id, clientName: best.name } };
  }

  if (action === "register_payment") {
    const d = data as RegisterPaymentData;
    const clients = await prisma.client.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const matches = findClientMatches(d.studentName, clients);

    if (matches.length === 0) {
      return {
        valid: false,
        message: `Não encontrei nenhum aluno com o nome "${d.studentName}". Verifique o nome e tente novamente.`,
        enriched: {},
      };
    }

    if (matches.length > 1) {
      const list = matches.slice(0, 4).map((c, i) => `${i + 1}. ${c.name}`).join("\n");
      return {
        valid: false,
        message: `Encontrei mais de um aluno com esse nome:\n${list}\n\nQual deles? Responda com o número ou o nome completo.`,
        enriched: {},
      };
    }

    const client = matches[0];

    // Busca parcela pendente com valor aproximado
    const tolerance = 0.20; // 20%
    const installment = await prisma.installment.findFirst({
      where: {
        sale: { clientId: client.id },
        status: { not: "pago" },
        amount: {
          gte: d.amount * (1 - tolerance),
          lte: d.amount * (1 + tolerance),
        },
      },
      include: { sale: { select: { id: true, description: true } } },
      orderBy: { dueDate: "asc" },
    });

    if (installment) {
      return {
        valid: true,
        enriched: {
          clientId: client.id,
          clientName: client.name,
          installmentId: installment.id,
          installmentAmount: installment.amount,
          installmentDueDate: installment.dueDate.toISOString().slice(0, 10),
          saleId: installment.sale.id,
        },
      };
    }

    // Sem parcela correspondente — vai criar FinancialTx avulso
    return {
      valid: true,
      enriched: { clientId: client.id, clientName: client.name },
    };
  }

  return { valid: true, enriched: {} };
}

// ─── Formata mensagem de confirmação ─────────────────────────────

export function buildConfirmationMessage(
  action: Intent,
  data: ExtractedData,
  enriched: Record<string, unknown> = {},
): string {
  if (action === "create_task") {
    const d = data as CreateTaskData;
    const clientLine = enriched.clientName
      ? `\n• Aluno/a: ${enriched.clientName}`
      : d.studentName
        ? `\n• Aluno/a: ${d.studentName} _(sem vínculo cadastrado)_`
        : "";
    const dateLine = d.dueDate ? `\n• Data: ${fmtDate(d.dueDate)}` : "";
    return `📋 Vou criar esta tarefa:\n\n• *${d.title}*${clientLine}${dateLine}\n\nConfirmar? _(sim/não)_`;
  }

  if (action === "register_payment") {
    const d = data as RegisterPaymentData;
    const name = (enriched.clientName as string) ?? d.studentName;
    const amount = (enriched.installmentAmount as number) ?? d.amount;
    const dateLine = d.date ? `\n• Data: ${fmtDate(d.date)}` : "\n• Data: hoje";
    const installmentLine = enriched.installmentId
      ? `\n• Parcela vinculada: sim ✓`
      : `\n• _(sem parcela cadastrada — lançamento avulso)_`;

    return `💰 Vou registrar este pagamento:\n\n• Aluno/a: *${name}*\n• Valor: *${fmt(amount)}*\n• Forma: ${d.paymentMethod}${dateLine}${installmentLine}\n\nConfirmar? _(sim/não)_`;
  }

  if (action === "create_expense") {
    const d = data as CreateExpenseData;
    const dateLine = d.dueDate ? `\n• Vencimento: ${fmtDate(d.dueDate)}` : "";
    return `💸 Vou lançar esta despesa:\n\n• *${d.description}*\n• Valor: ${fmt(d.amount)}\n• Categoria: ${d.category}${dateLine}\n\nConfirmar? _(sim/não)_`;
  }

  return "Confirmar? _(sim/não)_";
}

// ─── Executa ação confirmada ──────────────────────────────────────

export async function executeAction(
  action: Intent,
  data: ExtractedData,
  enriched: Record<string, unknown> = {},
  userId: string,
): Promise<string> {
  if (action === "create_task") {
    const d = data as CreateTaskData;
    await prisma.todoTask.create({
      data: {
        title: d.title,
        dueDate: d.dueDate ? new Date(d.dueDate + "T12:00:00") : null,
        type: d.type || "general",
        source: "whatsapp",
        status: "pending",
        userId,
        clientId: (enriched.clientId as string) || null,
      },
    });
    const dateLine = d.dueDate ? ` para ${fmtDate(d.dueDate)}` : "";
    const clientLine = enriched.clientName ? ` (${enriched.clientName})` : "";
    return `✅ Tarefa criada: *${d.title}*${clientLine}${dateLine}`;
  }

  if (action === "register_payment") {
    const d = data as RegisterPaymentData;
    const paidAt = d.date ? new Date(d.date + "T12:00:00") : new Date();
    const amount = (enriched.installmentAmount as number) ?? d.amount;
    const name = (enriched.clientName as string) ?? d.studentName;

    if (enriched.installmentId) {
      // Marca parcela como paga
      await prisma.installment.update({
        where: { id: enriched.installmentId as string },
        data: { status: "pago", paidAt },
      });
      // Atualiza FinancialTx vinculada se existir
      const linkedTx = await prisma.financialTx.findFirst({
        where: { installmentId: enriched.installmentId as string },
      });
      if (linkedTx) {
        await prisma.financialTx.update({
          where: { id: linkedTx.id },
          data: { status: "pago", paidAt, paymentMethod: d.paymentMethod },
        });
      }
    } else {
      // Lançamento avulso (sem parcela vinculada)
      await prisma.financialTx.create({
        data: {
          type: "receita",
          description: `Pagamento ${name}`,
          amount,
          category: "Mensalidade",
          status: "pago",
          paidAt,
          paymentMethod: d.paymentMethod,
          notes: d.notes || null,
          clientId: (enriched.clientId as string) || null,
        },
      });
    }

    return `✅ Pagamento registrado!\n• ${name}: ${fmt(amount)} (${d.paymentMethod})`;
  }

  if (action === "create_expense") {
    const d = data as CreateExpenseData;
    await prisma.financialTx.create({
      data: {
        type: "despesa",
        description: d.description,
        amount: d.amount,
        category: d.category || "Outros",
        status: "pendente",
        dueDate: d.dueDate ? new Date(d.dueDate + "T12:00:00") : null,
      },
    });
    return `✅ Despesa lançada: *${d.description}* — R$ ${d.amount}`;
  }

  if (action === "mark_paid") {
    const d = data as MarkPaidData;
    const tx = await prisma.financialTx.findFirst({
      where: { status: "pendente", description: { contains: d.description, mode: "insensitive" } },
    });
    if (tx) {
      await prisma.financialTx.update({ where: { id: tx.id }, data: { status: "pago", paidAt: new Date() } });
      return `✅ Pagamento de *${tx.description}* (${fmt(tx.amount)}) marcado como recebido!`;
    }
    return `Não encontrei nenhum lançamento pendente com esse nome.`;
  }

  return "Ação executada.";
}

// ─── Executa consultas diretas (sem confirmação) ──────────────────

export async function executeQuery(
  action: Intent,
  data: ExtractedData,
  userId: string,
  context: { pendingTasks: { title: string; dueDate: Date | null; client: { name: string } | null }[]; today: string },
): Promise<string> {
  const { pendingTasks, today } = context;

  if (action === "list_tasks") {
    if (pendingTasks.length === 0) return "Você não tem tarefas pendentes! 🎉";
    const list = pendingTasks
      .slice(0, 10)
      .map(t => `• ${t.title}${t.dueDate ? ` _(${fmtDate(t.dueDate.toISOString().slice(0, 10))})_` : ""}${t.client ? ` [${t.client.name}]` : ""}`)
      .join("\n");
    return `📋 *Tarefas pendentes (${pendingTasks.length}):*\n\n${list}`;
  }

  if (action === "day_summary") {
    const todayTasks = pendingTasks.filter(t => t.dueDate?.toISOString().slice(0, 10) === today);
    const overdue = pendingTasks.filter(t => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today);

    const overduePayments = await prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { lt: new Date(today + "T00:00:00") },
        sale: { client: { userId } },
      },
      include: { sale: { select: { client: { select: { name: true } } } } },
      take: 5,
    });

    let response = `☀️ *Resumo de hoje (${fmtDate(today)}):*\n\n`;
    response += `📋 Tarefas para hoje: *${todayTasks.length}*\n`;
    if (todayTasks.length > 0) response += todayTasks.map(t => `  • ${t.title}`).join("\n") + "\n";
    if (overdue.length > 0) response += `\n⚠️ Tarefas atrasadas: *${overdue.length}*\n` + overdue.slice(0, 3).map(t => `  • ${t.title}`).join("\n") + "\n";
    if (overduePayments.length > 0) {
      response += `\n💰 Pagamentos vencidos: *${overduePayments.length}*\n`;
      response += overduePayments.map(i => `  • ${i.sale.client.name}`).join("\n") + "\n";
    }
    return response.trim();
  }

  if (action === "query_pending") {
    const d = data as QueryPendingData;
    return await queryPending(d.queryType || "general", userId, today);
  }

  return "Não entendi. Tente reformular.";
}

async function queryPending(queryType: string, userId: string, today: string): Promise<string> {
  const todayDate = new Date(today + "T00:00:00");

  if (queryType === "who_didnt_pay") {
    const overdue = await prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { lt: todayDate },
        sale: { client: { userId } },
      },
      include: { sale: { select: { client: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    });

    if (overdue.length === 0) return "Todos os alunos estão em dia! ✅";

    const byClient = new Map<string, { name: string; count: number; total: number }>();
    for (const inst of overdue) {
      const name = inst.sale.client.name;
      const existing = byClient.get(name) ?? { name, count: 0, total: 0 };
      existing.count++;
      existing.total += inst.amount;
      byClient.set(name, existing);
    }

    const list = Array.from(byClient.values())
      .map(c => `• ${c.name} — ${fmt(c.total)} (${c.count} parcela${c.count > 1 ? "s" : ""})`)
      .join("\n");
    return `💰 *Quem não pagou (${byClient.size} aluno${byClient.size > 1 ? "s" : ""}):*\n\n${list}`;
  }

  if (queryType === "overdue") {
    const [overdueTasks, overduePayments] = await Promise.all([
      prisma.todoTask.findMany({
        where: { userId, status: { not: "done" }, dueDate: { lt: todayDate } },
        include: { client: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),
      prisma.installment.findMany({
        where: {
          status: { not: "pago" },
          dueDate: { lt: todayDate },
          sale: { client: { userId } },
        },
        include: { sale: { select: { client: { select: { name: true } } } } },
        take: 8,
      }),
    ]);

    let response = "⚠️ *O que está em atraso:*\n\n";
    if (overdueTasks.length > 0) {
      response += `📋 Tarefas atrasadas: *${overdueTasks.length}*\n`;
      response += overdueTasks.map(t => `  • ${t.title}${t.client ? ` [${t.client.name}]` : ""}`).join("\n") + "\n\n";
    }
    if (overduePayments.length > 0) {
      response += `💰 Pagamentos vencidos: *${overduePayments.length}*\n`;
      response += overduePayments.map(i => `  • ${i.sale.client.name} — ${fmt(i.amount)}`).join("\n");
    }
    if (overdueTasks.length === 0 && overduePayments.length === 0) {
      response = "Nada em atraso! Tudo em dia ✅";
    }
    return response.trim();
  }

  if (queryType === "today") {
    const todayEnd = new Date(today + "T23:59:59");
    const [todayTasks, todayPayments] = await Promise.all([
      prisma.todoTask.findMany({
        where: { userId, status: { not: "done" }, dueDate: { gte: todayDate, lte: todayEnd } },
        include: { client: { select: { name: true } } },
        orderBy: [{ urgent: "desc" }, { important: "desc" }],
      }),
      prisma.installment.findMany({
        where: { status: { not: "pago" }, dueDate: { gte: todayDate, lte: todayEnd }, sale: { client: { userId } } },
        include: { sale: { select: { client: { select: { name: true } } } } },
      }),
    ]);

    let response = "📅 *Hoje você tem:*\n\n";
    if (todayTasks.length > 0) {
      response += `📋 ${todayTasks.length} tarefa${todayTasks.length > 1 ? "s" : ""}:\n`;
      response += todayTasks.map((t, i) => `  ${i + 1}. ${t.title}`).join("\n") + "\n\n";
    } else {
      response += "📋 Nenhuma tarefa para hoje\n\n";
    }
    if (todayPayments.length > 0) {
      response += `💰 ${todayPayments.length} pagamento${todayPayments.length > 1 ? "s" : ""} vencendo hoje:\n`;
      response += todayPayments.map(i => `  • ${i.sale.client.name} — ${fmt(i.amount)}`).join("\n");
    }
    return response.trim() || "Nada especial para hoje! ✅";
  }

  // General
  const [overdueTasksCount, overduePaymentsCount, todayTasks] = await Promise.all([
    prisma.todoTask.count({ where: { userId, status: { not: "done" }, dueDate: { lt: todayDate } } }),
    prisma.installment.count({ where: { status: { not: "pago" }, dueDate: { lt: todayDate }, sale: { client: { userId } } } }),
    prisma.todoTask.count({ where: { userId, status: { not: "done" }, dueDate: { gte: todayDate, lte: new Date(today + "T23:59:59") } } }),
  ]);

  let response = "📊 *Resumo de pendências:*\n\n";
  response += `📋 Tarefas hoje: *${todayTasks}*\n`;
  response += `⚠️ Tarefas atrasadas: *${overdueTasksCount}*\n`;
  response += `💰 Pagamentos vencidos: *${overduePaymentsCount}*\n`;
  response += "\nDigite \"atrasadas\", \"quem não pagou\" ou \"hoje\" para detalhes.";
  return response;
}

// ─── Utilitário: match de clientes por nome ───────────────────────

export function findClientMatches(
  name: string,
  clients: { id: string; name: string }[],
): { id: string; name: string }[] {
  const normalized = name.toLowerCase().trim();

  // Match exato (case-insensitive)
  const exact = clients.filter(c => c.name.toLowerCase() === normalized);
  if (exact.length > 0) return exact;

  // Começa com o nome buscado
  const startsWith = clients.filter(c => c.name.toLowerCase().startsWith(normalized));
  if (startsWith.length > 0) return startsWith;

  // Contém o nome buscado
  const contains = clients.filter(c => c.name.toLowerCase().includes(normalized));
  return contains;
}

/**
 * Serviços internos do Sistema FGT usados pelo OpenClaw.
 * Toda lógica crítica de banco fica aqui — desacoplada da interface.
 */

import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { findClientMatches } from "@/lib/whatsapp/executor";
import { addMonths, defaultCashDate, toReceivableMethod } from "@/lib/financeiro/receivables";
import type {
  OCCreateStudentData, OCRegisterPaymentData, OCCreateTaskData,
  OCAddStudentNoteData, OCSaveContentIdeaData, OCEnriched, OCQueryType,
  OCQueryCRMData, OCCreateLeadData,
} from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

// Converte um Date em "YYYY-MM-DD" usando os componentes LOCAIS (ano/mês/dia),
// não o UTC de toISOString() — que pode rolar para o dia seguinte quando o
// horário local está tarde o suficiente em fusos negativos (ex: UTC-3).
const toLocalIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// ─── 1. getDailyPendingSummary ────────────────────────────────────

export async function getDailyPendingSummary(userId: string, queryType: OCQueryType): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayStart = new Date(todayStr + "T00:00:00");
  const todayEnd = new Date(todayStr + "T23:59:59");

  if (queryType === "who_didnt_pay") {
    const overdue = await prisma.installment.findMany({
      where: {
        status: { not: "pago" },
        dueDate: { lt: todayStart },
        sale: { client: { userId } },
      },
      include: { sale: { select: { client: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
      take: 15,
    });
    if (overdue.length === 0) return "Todos os alunos estão em dia! ✅";

    const byClient = new Map<string, { name: string; count: number; total: number }>();
    for (const inst of overdue) {
      const name = inst.sale.client.name;
      const ex = byClient.get(name) ?? { name, count: 0, total: 0 };
      ex.count++; ex.total += inst.amount;
      byClient.set(name, ex);
    }
    const list = Array.from(byClient.values())
      .map(c => `• ${c.name} — ${fmt(c.total)} (${c.count} parcela${c.count > 1 ? "s" : ""})`)
      .join("\n");
    return `💰 *Quem não pagou (${byClient.size} aluno${byClient.size > 1 ? "s" : ""}):*\n\n${list}`;
  }

  if (queryType === "overdue") {
    const [tasks, payments] = await Promise.all([
      prisma.todoTask.findMany({
        where: { userId, status: { not: "done" }, dueDate: { lt: todayStart } },
        include: { client: { select: { name: true } } },
        orderBy: { dueDate: "asc" }, take: 8,
      }),
      prisma.installment.findMany({
        where: { status: { not: "pago" }, dueDate: { lt: todayStart }, sale: { client: { userId } } },
        include: { sale: { select: { client: { select: { name: true } } } } },
        take: 8,
      }),
    ]);
    let r = "⚠️ *Em atraso:*\n\n";
    if (tasks.length > 0) {
      r += `📋 Tarefas (${tasks.length}):\n` + tasks.map(t => `  • ${t.title}${t.client ? ` [${t.client.name}]` : ""}`).join("\n") + "\n\n";
    }
    if (payments.length > 0) {
      r += `💰 Pagamentos (${payments.length}):\n` + payments.map(i => `  • ${i.sale.client.name} — ${fmt(i.amount)}`).join("\n");
    }
    if (tasks.length === 0 && payments.length === 0) r = "Nada em atraso! ✅";
    return r.trim();
  }

  if (queryType === "attention") {
    const clients = await prisma.client.findMany({
      where: {
        userId,
        sales: { some: { installments: { some: { status: { not: "pago" }, dueDate: { lt: todayStart } } } } },
      },
      select: {
        name: true,
        sales: {
          select: {
            installments: {
              where: { status: { not: "pago" }, dueDate: { lt: todayStart } },
              select: { amount: true, dueDate: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    if (clients.length === 0) return "Nenhum aluno em situação de atenção no momento. ✅";
    const list = clients.map(c => {
      const allInstallments = c.sales.flatMap(s => s.installments);
      const total = allInstallments.reduce((sum, i) => sum + i.amount, 0);
      const oldest = allInstallments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
      const daysLate = Math.floor((today.getTime() - oldest.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return `• *${c.name}* — ${fmt(total)} (${allInstallments.length} parcela${allInstallments.length > 1 ? "s" : ""} · ${daysLate}d em atraso)`;
    }).join("\n");
    return `🔴 *Alunos em atenção (${clients.length}):*\n\n${list}`;
  }

  if (queryType === "today") {
    const [todayTasks, todayPayments] = await Promise.all([
      prisma.todoTask.findMany({
        where: { userId, status: { not: "done" }, dueDate: { gte: todayStart, lte: todayEnd } },
        include: { client: { select: { name: true } } },
        orderBy: [{ urgent: "desc" }, { important: "desc" }],
      }),
      prisma.installment.findMany({
        where: { status: { not: "pago" }, dueDate: { gte: todayStart, lte: todayEnd }, sale: { client: { userId } } },
        include: { sale: { select: { client: { select: { name: true } } } } },
      }),
    ]);
    let r = `📅 *Hoje (${fmtDate(todayStr)}):*\n\n`;
    if (todayTasks.length > 0) {
      r += `📋 ${todayTasks.length} tarefa${todayTasks.length > 1 ? "s" : ""}:\n` +
        todayTasks.map((t, i) => `  ${i + 1}. ${t.title}${t.client ? ` [${t.client.name}]` : ""}`).join("\n") + "\n\n";
    } else {
      r += "📋 Sem tarefas para hoje\n\n";
    }
    if (todayPayments.length > 0) {
      r += `💰 ${todayPayments.length} pagamento${todayPayments.length > 1 ? "s" : ""} vencendo hoje:\n` +
        todayPayments.map(i => `  • ${i.sale.client.name} — ${fmt(i.amount)}`).join("\n");
    }
    return r.trim();
  }

  // General summary
  const [taskCount, overdueTaskCount, overduePaymentCount, todayTaskCount] = await Promise.all([
    prisma.todoTask.count({ where: { userId, status: { not: "done" } } }),
    prisma.todoTask.count({ where: { userId, status: { not: "done" }, dueDate: { lt: todayStart } } }),
    prisma.installment.count({ where: { status: { not: "pago" }, dueDate: { lt: todayStart }, sale: { client: { userId } } } }),
    prisma.todoTask.count({ where: { userId, status: { not: "done" }, dueDate: { gte: todayStart, lte: todayEnd } } }),
  ]);
  let r = `📊 *Resumo do dia (${fmtDate(todayStr)}):*\n\n`;
  r += `📋 Tarefas hoje: *${todayTaskCount}*\n`;
  r += `⚠️ Tarefas atrasadas: *${overdueTaskCount}*\n`;
  r += `📋 Total pendentes: *${taskCount}*\n`;
  r += `💰 Pagamentos vencidos: *${overduePaymentCount}*\n`;
  r += "\nDigite _\"quem não pagou\"_, _\"atrasadas\"_ ou _\"hoje\"_ para detalhes.";
  return r;
}

// ─── 2. enrichCreateStudent ────────────────────────────────────────

export async function enrichCreateStudent(
  data: OCCreateStudentData,
  userId: string,
): Promise<{ valid: boolean; message?: string; enriched: OCEnriched }> {
  // Verifica se já existe aluno com nome parecido
  const existing = await prisma.client.findMany({
    where: { userId, name: { contains: data.name.split(" ")[0], mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing.length > 0) {
    const names = existing.map(c => c.name).join(", ");
    // Só avisa, não bloqueia
    console.log(`[OpenClaw] Aluno parecido já existe: ${names}`);
  }

  if (!data.planName) return { valid: true, enriched: {} };

  // Busca plano por nome
  const plans = await prisma.servicePlan.findMany({
    where: { userId, active: true },
  });
  const matches = plans.filter(p =>
    p.name.toLowerCase().includes(data.planName!.toLowerCase()) ||
    data.planName!.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])
  );

  if (matches.length === 0) {
    return {
      valid: true,
      enriched: {},
      message: `⚠️ Plano "${data.planName}" não encontrado. Cria a aluna sem plano por enquanto?`,
    };
  }

  const plan = matches[0];
  return {
    valid: true,
    enriched: {
      planId: plan.id,
      planDisplayName: plan.name,
      planTotal: plan.totalAmount,
      planInstallments: plan.installments,
      planDurationMonths: plan.durationMonths,
    },
  };
}

// ─── 3. createStudent ─────────────────────────────────────────────

export async function createStudent(
  data: OCCreateStudentData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  // Cria o cliente
  const client = await prisma.client.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      status: "ativo",
      planName: enriched.planDisplayName || data.planName || null,
      notes: data.objective ? `Objetivo: ${data.objective}` : null,
      paymentMethod: data.paymentMethod || "Pix",
      userId,
    },
  });

  let financialLine = "";

  // Cria negociação + parcelas se houver plano
  if (enriched.planId && enriched.planTotal && enriched.planInstallments) {
    const today = new Date();
    const installmentAmount = enriched.planTotal / enriched.planInstallments;

    const metodo = toReceivableMethod(data.paymentMethod || "Pix");

    const sale = await prisma.sale.create({
      data: {
        description: enriched.planDisplayName!,
        totalAmount: enriched.planTotal,
        installmentsCount: enriched.planInstallments,
        paymentMethod: metodo,
        status: "ativo",
        negotiationType: enriched.planInstallments === 1 ? "cash" : "custom",
        clientId: client.id,
        servicePlanId: enriched.planId,
      },
    });

    const startIso = toLocalIsoDate(today);

    for (let i = 1; i <= enriched.planInstallments; i++) {
      // addMonths clampa o dia na virada de mês (31/01 + 1 = 28/02).
      // setMonth cru transbordava e gerava vencimentos duplicados.
      const dueIso  = addMonths(startIso, i - 1);
      const dueDate = new Date(dueIso + "T12:00");
      const cashIso = defaultCashDate(dueIso, metodo);
      await prisma.installment.create({
        data: {
          number: i,
          amount: installmentAmount,
          netValue: installmentAmount,
          dueDate,
          cashDate: new Date(cashIso + "T12:00"),
          paymentMethod: metodo,
          status: "pendente",
          saleId: sale.id,
          label: i === 1 ? "1ª parcela" : `${i}ª parcela`,
        },
      });
    }
    financialLine = `• ${enriched.planInstallments}x ${fmt(installmentAmount)} geradas\n`;
  }

  // Cria tarefas de onboarding automáticas
  await prisma.todoTask.createMany({
    data: [
      {
        title: `Anamnese — ${data.name}`,
        type: "student",
        source: "automatic",
        status: "pending",
        urgent: true,
        important: true,
        userId,
        clientId: client.id,
      },
      {
        title: `Enviar contrato — ${data.name}`,
        type: "administrative",
        source: "automatic",
        status: "pending",
        userId,
        clientId: client.id,
      },
      {
        title: `Check-in inicial — ${data.name}`,
        type: "student",
        source: "automatic",
        status: "pending",
        userId,
        clientId: client.id,
      },
    ],
  });

  const objectiveLine = data.objective ? `• Objetivo: ${data.objective}\n` : "";
  return `✅ Aluna *${data.name}* criada!\n\n${objectiveLine}${financialLine}• 3 tarefas de onboarding criadas`;
}

// ─── 4. enrichRegisterPayment ─────────────────────────────────────

export async function enrichRegisterPayment(
  data: OCRegisterPaymentData,
  userId: string,
): Promise<{ valid: boolean; message?: string; enriched: OCEnriched }> {
  const clients = await prisma.client.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const matches = findClientMatches(data.studentName, clients);

  if (matches.length === 0) {
    return { valid: false, message: `Não encontrei nenhuma aluna com o nome _"${data.studentName}"_. Verifique o nome e tente novamente.`, enriched: {} };
  }
  if (matches.length > 1) {
    const list = matches.slice(0, 4).map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    return { valid: false, message: `Encontrei mais de uma aluna:\n${list}\n\nQual delas? Responda com o número ou nome completo.`, enriched: {} };
  }

  const client = matches[0];
  const tolerance = 0.20;
  const installment = await prisma.installment.findFirst({
    where: {
      sale: { clientId: client.id },
      status: { not: "pago" },
      amount: { gte: data.amount * (1 - tolerance), lte: data.amount * (1 + tolerance) },
    },
    include: { sale: { select: { id: true } } },
    orderBy: { dueDate: "asc" },
  });

  return {
    valid: true,
    enriched: {
      clientId: client.id,
      clientName: client.name,
      installmentId: installment?.id,
      installmentAmount: installment?.amount,
      installmentDueDate: installment?.dueDate.toISOString().slice(0, 10),
      saleId: installment?.sale.id,
    },
  };
}

// ─── 5. registerPayment ──────────────────────────────────────────

export async function registerPayment(
  data: OCRegisterPaymentData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  const paidAt = data.date ? new Date(data.date + "T12:00:00") : new Date();
  const amount = enriched.installmentAmount ?? data.amount;
  const name = enriched.clientName ?? data.studentName;

  if (enriched.installmentId) {
    await prisma.installment.update({
      where: { id: enriched.installmentId },
      data: { status: "pago", paidAt },
    });
    const linkedTx = await prisma.financialTx.findFirst({ where: { installmentId: enriched.installmentId } });
    if (linkedTx) {
      await prisma.financialTx.update({ where: { id: linkedTx.id }, data: { status: "pago", paidAt, paymentMethod: data.paymentMethod } });
    }
  } else {
    await prisma.financialTx.create({
      data: {
        type: "receita",
        description: `Pagamento ${name}`,
        amount: data.amount,
        category: "Mensalidade",
        status: "pago",
        paidAt,
        paymentMethod: data.paymentMethod,
        notes: data.notes || null,
        clientId: enriched.clientId || null,
      },
    });
  }

  return `✅ Pagamento registrado!\n• *${name}*: ${fmt(amount)} (${data.paymentMethod})${enriched.installmentId ? "\n• Parcela vinculada marcada como paga ✓" : ""}`;
}

// ─── 6. createTask ───────────────────────────────────────────────

export async function createTask(
  data: OCCreateTaskData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  await prisma.todoTask.create({
    data: {
      title: data.title,
      dueDate: data.dueDate ? new Date(data.dueDate + "T12:00:00") : null,
      type: data.type || "general",
      source: "automatic",
      status: "pending",
      userId,
      clientId: enriched.clientId || null,
    },
  });
  const dateLine = data.dueDate ? ` para ${fmtDate(data.dueDate)}` : "";
  const clientLine = enriched.clientName ? ` [${enriched.clientName}]` : "";
  return `✅ Tarefa criada: *${data.title}*${clientLine}${dateLine}`;
}

// ─── 7. addStudentNote ───────────────────────────────────────────

export async function addStudentNote(
  data: OCAddStudentNoteData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  if (!enriched.clientId) return "Não encontrei a aluna para salvar a observação.";

  await prisma.interaction.create({
    data: {
      type: "nota",
      content: data.note,
      clientId: enriched.clientId,
      userId,
    },
  });

  return `✅ Observação salva para *${enriched.clientName ?? data.studentName}*:\n_"${data.note}"_`;
}

// ─── 8. enrichAddStudentNote ─────────────────────────────────────

export async function enrichAddStudentNote(
  data: OCAddStudentNoteData,
  userId: string,
): Promise<{ valid: boolean; message?: string; enriched: OCEnriched }> {
  const clients = await prisma.client.findMany({ where: { userId }, select: { id: true, name: true } });
  const matches = findClientMatches(data.studentName, clients);

  if (matches.length === 0) {
    return { valid: false, message: `Não encontrei nenhuma aluna com o nome _"${data.studentName}"_.`, enriched: {} };
  }
  if (matches.length > 1) {
    const list = matches.slice(0, 4).map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    return { valid: false, message: `Encontrei mais de uma aluna:\n${list}\n\nQual delas?`, enriched: {} };
  }
  return { valid: true, enriched: { clientId: matches[0].id, clientName: matches[0].name } };
}

// ─── 9. saveContentIdea ──────────────────────────────────────────

export async function enrichSaveContentIdea(idea: string): Promise<OCEnriched> {
  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Para esta ideia de conteúdo fitness: "${idea}"

Retorne APENAS um JSON (sem markdown):
{
  "format": "reels" | "stories" | "carrossel",
  "hook": "frase de gancho curta e direta para primeira tela/início do vídeo (máx 15 palavras)"
}`,
      }],
    });
    const text = (res.content[0] as { text: string }).text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { suggestedFormat: parsed.format, hook: parsed.hook };
    }
  } catch { /* fallback */ }
  return { suggestedFormat: "reels", hook: idea.slice(0, 80) };
}

export async function saveContentIdea(
  data: OCSaveContentIdeaData,
  enriched: OCEnriched,
  userId: string,
): Promise<string> {
  await prisma.contentIdea.create({
    data: {
      rawIdea: data.idea,
      suggestedFormat: enriched.suggestedFormat || "reels",
      hook: enriched.hook || null,
      status: "idea",
      userId,
    },
  });

  const formatEmoji = { reels: "🎬", stories: "📱", carrossel: "🎠" }[enriched.suggestedFormat || "reels"] ?? "💡";
  return `✅ Ideia salva!\n\n${formatEmoji} Formato: *${enriched.suggestedFormat}*\n💬 Gancho: _"${enriched.hook}"_\n\n_"${data.idea}"_`;
}

// ─── 10. queryCRM ─────────────────────────────────────────────────

export async function queryCRM(userId: string, queryType: OCQueryCRMData["queryType"]): Promise<string> {
  const now = new Date();

  if (queryType === "pipeline") {
    const deals = await prisma.deal.findMany({
      where: { userId },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (deals.length === 0) return "Nenhum lead no pipeline. 📭";
    const byStage = new Map<string, number>();
    let totalValue = 0;
    for (const d of deals) {
      byStage.set(d.stage, (byStage.get(d.stage) ?? 0) + 1);
      totalValue += d.value ?? 0;
    }
    const stageLabels: Record<string, string> = {
      lead: "Lead", prospect: "Prospect", proposta: "Proposta",
      contrato: "Contrato", andamento: "Em Andamento", concluido: "Concluído",
    };
    const lines = Array.from(byStage.entries())
      .map(([s, n]) => `  • ${stageLabels[s] ?? s}: *${n}*`)
      .join("\n");
    return `📊 *Pipeline CRM (${deals.length} deals):*\n\n${lines}\n\nTotal estimado: *${fmt(totalValue)}*`;
  }

  if (queryType === "stuck") {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const stuck = await prisma.deal.findMany({
      where: { userId, updatedAt: { lt: threeDaysAgo }, stage: { notIn: ["concluido"] } },
      include: { client: { select: { name: true } } },
      orderBy: { updatedAt: "asc" },
      take: 10,
    });
    if (stuck.length === 0) return "Nenhum lead parado nos últimos 3 dias. ✅";
    const list = stuck.map(d => {
      const days = Math.floor((now.getTime() - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      return `• ${d.client.name} — ${d.title} _(${days}d sem movimento)_`;
    }).join("\n");
    return `⚠️ *Leads parados (${stuck.length}):*\n\n${list}`;
  }

  if (queryType === "no_action") {
    const noAction = await prisma.deal.findMany({
      where: { userId, nextAction: null, stage: { notIn: ["concluido"] } },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    if (noAction.length === 0) return "Todos os leads têm próxima ação definida. ✅";
    const list = noAction.map(d => `• ${d.client.name} — ${d.title}`).join("\n");
    return `📋 *Leads sem próxima ação (${noAction.length}):*\n\n${list}\n\nDe qual você quer cuidar primeiro?`;
  }

  // general
  const [total, noAct, stuck3] = await Promise.all([
    prisma.deal.count({ where: { userId, stage: { notIn: ["concluido"] } } }),
    prisma.deal.count({ where: { userId, nextAction: null, stage: { notIn: ["concluido"] } } }),
    prisma.deal.count({
      where: {
        userId,
        stage: { notIn: ["concluido"] },
        updatedAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  return `📊 *Resumo CRM:*\n\n• Leads ativos: *${total}*\n• Sem próxima ação: *${noAct}*\n• Parados +3 dias: *${stuck3}*\n\nDigite _"leads parados"_ ou _"sem ação"_ para detalhes.`;
}

// ─── 11. createLead ──────────────────────────────────────────────

export async function createLead(
  data: OCCreateLeadData,
  userId: string,
): Promise<string> {
  // Cria ou reutiliza cliente
  const existing = await prisma.client.findFirst({
    where: { userId, name: { contains: data.name.split(" ")[0], mode: "insensitive" } },
  });

  const client = existing ?? await prisma.client.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      status: "lead",
      source: data.source || null,
      notes: data.objectives ? `Objetivo: ${data.objectives}` : null,
      userId,
    },
  });

  const deal = await prisma.deal.create({
    data: {
      title: data.title || `Lead — ${data.name}`,
      value: data.value || null,
      stage: "lead",
      priority: "medium",
      nextAction: data.nextAction || null,
      source: data.source || null,
      objectives: data.objectives || null,
      clientId: client.id,
      userId,
    },
  });

  const sourceLine = data.source ? `• Origem: ${data.source}\n` : "";
  const valueLine = data.value ? `• Valor estimado: ${fmt(data.value)}\n` : "";
  const nextLine = data.nextAction ? `• Próxima ação: ${data.nextAction}\n` : "";
  const reuseNote = existing ? `_(cliente existente reutilizado)_\n` : "";

  return `✅ Lead criado no CRM!\n\n• *${data.name}*\n${reuseNote}${sourceLine}${valueLine}${nextLine}\nAcesse o CRM para acompanhar o pipeline.`;
}

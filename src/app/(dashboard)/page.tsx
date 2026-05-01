"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckSquare, DollarSign, Users, AlertTriangle, Loader2, Check,
  ArrowRight, Calendar, Clock, ChevronRight, Zap, Star,
  TrendingUp, FolderKanban,
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  type: string;
  urgent: boolean | null;
  important: boolean | null;
  client: { id: string; name: string } | null;
};

type Payment = {
  id: string;
  amount: number;
  dueDate: string;
  label: string | null;
  status: string;
  sale: {
    id: string;
    description: string;
    client: { id: string; name: string };
  };
};

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  client: { id: string; name: string } | null;
};

type Summary = {
  todayTasks: Task[];
  overdueTasksList: Task[];
  overdueTasks: number;
  activeStudents: number;
  pendingFinancial: number;
  overduePayments: Payment[];
  todayPayments: Payment[];
  upcomingEvents: CalEvent[];
  priorityTasks: Task[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  general: "#6366f1", student: "#10b981", financial: "#f59e0b",
  content: "#3b82f6", administrative: "#8b5cf6", commercial: "#ec4899",
};
const TYPE_BG: Record<string, string> = {
  general: "#eef2ff", student: "#f0fdf4", financial: "#fffbeb",
  content: "#eff6ff", administrative: "#f5f3ff", commercial: "#fdf2f8",
};
const TYPE_LABELS: Record<string, string> = {
  general: "Geral", student: "Aluno", financial: "Financeiro",
  content: "Conteúdo", administrative: "Adm", commercial: "Comercial",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function formatEventTime(iso: string, allDay: boolean) {
  if (allDay) return "Dia todo";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─── TaskRow ─────────────────────────────────────────────────────────────────

function TaskRow({
  task, onComplete, completing,
}: {
  task: Task;
  onComplete: (id: string) => void;
  completing: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-2 py-2 hover:bg-gray-50 rounded-xl transition-colors">
      <button
        onClick={() => onComplete(task.id)}
        disabled={completing}
        className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-indigo-500 flex items-center justify-center transition-colors disabled:opacity-40"
      >
        {completing && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {task.urgent && <Zap className="w-3 h-3 text-red-500 flex-shrink-0" />}
          {!task.urgent && task.important && <Star className="w-3 h-3 text-amber-500 flex-shrink-0" />}
          <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span
            className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{
              color: TYPE_COLORS[task.type] ?? "#6366f1",
              background: TYPE_BG[task.type] ?? "#eef2ff",
            }}
          >
            {TYPE_LABELS[task.type] ?? task.type}
          </span>
          {task.client && (
            <span className="text-xs text-gray-400 truncate">{task.client.name}</span>
          )}
          {task.dueDate && (
            <span className="text-xs text-gray-300">{formatDate(task.dueDate)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PaymentRow ───────────────────────────────────────────────────────────────

function PaymentRow({
  payment, isToday, onMarkPaid, paying,
}: {
  payment: Payment;
  isToday: boolean;
  onMarkPaid: (p: Payment) => void;
  paying: boolean;
}) {
  const days = daysOverdue(payment.dueDate);
  return (
    <div className={`flex items-center gap-2 px-2 py-2 rounded-xl ${isToday ? "bg-amber-50" : "bg-red-50"}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {payment.sale.client.name}
        </p>
        <p className={`text-xs truncate ${isToday ? "text-amber-600" : "text-red-500"}`}>
          {payment.label ?? payment.sale.description}
          {isToday ? " · vence hoje" : ` · ${days}d atraso`}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`text-sm font-semibold ${isToday ? "text-amber-700" : "text-red-700"}`}>
          {formatCurrency(payment.amount)}
        </span>
        <button
          onClick={() => onMarkPaid(payment)}
          disabled={paying}
          className={`text-xs text-white rounded-lg px-2 py-1 transition-colors disabled:opacity-50 ${
            isToday ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {paying ? "..." : "Pago"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [payingOff, setPayingOff] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/home");
    const data = await res.json();
    setSummary(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleComplete(id: string) {
    setCompleting((prev) => new Set([...prev, id]));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setSummary((prev) => {
      if (!prev) return prev;
      const filter = (arr: Task[]) => arr.filter((t) => t.id !== id);
      const newOverdue = filter(prev.overdueTasksList);
      return {
        ...prev,
        todayTasks: filter(prev.todayTasks),
        overdueTasksList: newOverdue,
        overdueTasks: prev.overdueTasks - (prev.overdueTasksList.some(t => t.id === id) ? 1 : 0),
        priorityTasks: filter(prev.priorityTasks),
      };
    });
    setCompleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  async function handleMarkPaid(payment: Payment) {
    setPayingOff((prev) => new Set([...prev, payment.id]));
    await fetch(`/api/financeiro/vendas/${payment.sale.id}/parcelas/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pago", paidAt: new Date().toISOString() }),
    });
    setSummary((prev) => {
      if (!prev) return prev;
      const isOverdue = prev.overduePayments.some((p) => p.id === payment.id);
      return {
        ...prev,
        overduePayments: prev.overduePayments.filter((p) => p.id !== payment.id),
        todayPayments: prev.todayPayments.filter((p) => p.id !== payment.id),
        pendingFinancial: Math.max(0, prev.pendingFinancial - 1),
        overduePayments_count: isOverdue ? (prev.overduePayments.length - 1) : prev.overduePayments.length,
      } as Summary;
    });
    setPayingOff((prev) => { const s = new Set(prev); s.delete(payment.id); return s; });
  }

  const overduePayments = summary?.overduePayments ?? [];
  const todayPayments = summary?.todayPayments ?? [];
  const hasPayments = overduePayments.length > 0 || todayPayments.length > 0;
  const hasEvents = (summary?.upcomingEvents?.length ?? 0) > 0;
  const hasPriority = (summary?.priorityTasks?.length ?? 0) > 0;
  const hasOverdueTasks = (summary?.overdueTasks ?? 0) > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, Fernando 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1 capitalize">{todayLabel()}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Link
              href="/tarefas"
              className="rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow bg-[#eef2ff]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Tarefas hoje</span>
                <CheckSquare className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-indigo-600">
                {summary?.todayTasks.length ?? 0}
              </p>
            </Link>

            <Link
              href="/tarefas"
              className={`rounded-2xl p-4 border hover:shadow-md transition-shadow ${
                hasOverdueTasks
                  ? "border-red-100 bg-[#fef2f2]"
                  : "border-gray-100 bg-[#f8fafc]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Atrasadas</span>
                <AlertTriangle className={`w-4 h-4 ${hasOverdueTasks ? "text-red-500" : "text-gray-300"}`} />
              </div>
              <p className={`text-2xl font-bold ${hasOverdueTasks ? "text-red-600" : "text-gray-300"}`}>
                {summary?.overdueTasks ?? 0}
              </p>
            </Link>

            <Link
              href="/financeiro"
              className={`rounded-2xl p-4 border hover:shadow-md transition-shadow ${
                overduePayments.length > 0
                  ? "border-red-100 bg-[#fef2f2]"
                  : "border-gray-100 bg-[#f8fafc]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Pag. vencidos</span>
                <DollarSign className={`w-4 h-4 ${overduePayments.length > 0 ? "text-red-500" : "text-gray-300"}`} />
              </div>
              <p className={`text-2xl font-bold ${overduePayments.length > 0 ? "text-red-600" : "text-gray-300"}`}>
                {overduePayments.length}
              </p>
            </Link>

            <Link
              href="/alunos"
              className="rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow bg-[#f0fdf4]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Alunos ativos</span>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-600">
                {summary?.activeStudents ?? 0}
              </p>
            </Link>
          </div>

          {/* Main grid: tarefas (left) + pagamentos/eventos (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">

            {/* LEFT — Tarefas */}
            <div className="lg:col-span-3 space-y-4">

              {/* Tarefas de hoje */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-500" />
                    Tarefas de hoje
                    {(summary?.todayTasks.length ?? 0) > 0 && (
                      <span className="text-xs bg-indigo-100 text-indigo-600 rounded-full px-2 py-0.5 font-medium">
                        {summary?.todayTasks.length}
                      </span>
                    )}
                  </h2>
                  <Link href="/tarefas" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                    Ver todas <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="p-3">
                  {(summary?.todayTasks.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center py-6 text-center">
                      <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-2">
                        <Check className="w-5 h-5 text-green-400" />
                      </div>
                      <p className="text-sm text-gray-400">Nenhuma tarefa para hoje.</p>
                      <Link href="/tarefas" className="text-xs text-indigo-500 mt-1">Criar tarefa</Link>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {summary?.todayTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onComplete={handleComplete}
                          completing={completing.has(task.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tarefas atrasadas */}
              {hasOverdueTasks && (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-red-50">
                    <h2 className="font-semibold text-red-700 text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Tarefas atrasadas
                      <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-medium">
                        {summary?.overdueTasks}
                      </span>
                    </h2>
                    <Link href="/tarefas" className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">
                      Ver todas <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="p-3">
                    <div className="space-y-0.5">
                      {summary?.overdueTasksList.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onComplete={handleComplete}
                          completing={completing.has(task.id)}
                        />
                      ))}
                      {(summary?.overdueTasks ?? 0) > (summary?.overdueTasksList.length ?? 0) && (
                        <Link
                          href="/tarefas"
                          className="flex items-center justify-center gap-1 py-2 text-xs text-red-400 hover:text-red-500"
                        >
                          + {(summary?.overdueTasks ?? 0) - (summary?.overdueTasksList.length ?? 0)} mais
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — Pagamentos + Eventos */}
            <div className="lg:col-span-2 space-y-4">

              {/* Pagamentos */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    Pagamentos
                    {hasPayments && (
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                        overduePayments.length > 0
                          ? "bg-red-100 text-red-600"
                          : "bg-amber-100 text-amber-600"
                      }`}>
                        {overduePayments.length + todayPayments.length}
                      </span>
                    )}
                  </h2>
                  <Link href="/financeiro" className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                    Ver <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="p-3">
                  {!hasPayments ? (
                    <div className="flex flex-col items-center py-5 text-center">
                      <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center mb-2">
                        <Check className="w-4 h-4 text-green-400" />
                      </div>
                      <p className="text-xs text-gray-400">Sem pagamentos pendentes.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {todayPayments.map((payment) => (
                        <PaymentRow
                          key={payment.id}
                          payment={payment}
                          isToday={true}
                          onMarkPaid={handleMarkPaid}
                          paying={payingOff.has(payment.id)}
                        />
                      ))}
                      {overduePayments.map((payment) => (
                        <PaymentRow
                          key={payment.id}
                          payment={payment}
                          isToday={false}
                          onMarkPaid={handleMarkPaid}
                          paying={payingOff.has(payment.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Próximos eventos */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    Próximos eventos
                  </h2>
                  <Link href="/agenda" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                    Agenda <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="p-3">
                  {!hasEvents ? (
                    <div className="flex flex-col items-center py-5 text-center">
                      <p className="text-xs text-gray-400">Sem eventos nos próximos 7 dias.</p>
                      <Link href="/agenda" className="text-xs text-blue-500 mt-1">Ver agenda</Link>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {summary?.upcomingEvents.map((event) => {
                        const d = new Date(event.start);
                        const isToday = d.toDateString() === new Date().toDateString();
                        return (
                          <div key={event.id} className="flex items-start gap-3 px-2 py-2 hover:bg-gray-50 rounded-xl">
                            <div className="flex-shrink-0 w-8 text-center">
                              <p className="text-sm font-bold text-blue-600 leading-tight">{d.getDate()}</p>
                              <p className="text-xs text-gray-400 uppercase leading-tight">
                                {d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{event.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Clock className="w-3 h-3 text-gray-300 flex-shrink-0" />
                                <span className="text-xs text-gray-400">
                                  {formatEventTime(event.start, event.allDay)}
                                </span>
                                {isToday && (
                                  <span className="text-xs text-blue-500 font-medium">hoje</span>
                                )}
                                {event.client && (
                                  <span className="text-xs text-gray-400 truncate">· {event.client.name}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Prioridades do dia (urgente/importante sem data ou data futura) */}
          {hasPriority && (
            <div className="bg-white rounded-2xl border border-purple-100 shadow-sm mb-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-purple-50">
                <h2 className="font-semibold text-purple-700 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-500" />
                  Prioridades
                  <span className="text-xs bg-purple-100 text-purple-600 rounded-full px-2 py-0.5 font-medium">
                    {summary?.priorityTasks.length}
                  </span>
                </h2>
                <Link href="/tarefas" className="text-xs text-purple-500 hover:text-purple-600 font-medium flex items-center gap-1">
                  Gerenciar <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-0.5">
                {summary?.priorityTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    completing={completing.has(task.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Acesso rápido + WhatsApp */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">Acesso rápido</h2>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2">
                {[
                  { label: "Tarefas",    href: "/tarefas",    color: "#6366f1", bg: "#eef2ff", Icon: CheckSquare },
                  { label: "Alunos",     href: "/alunos",     color: "#10b981", bg: "#f0fdf4", Icon: Users },
                  { label: "Financeiro", href: "/financeiro", color: "#f59e0b", bg: "#fffbeb", Icon: DollarSign },
                  { label: "CRM",        href: "/crm",        color: "#8b5cf6", bg: "#f5f3ff", Icon: TrendingUp },
                  { label: "Agenda",     href: "/agenda",     color: "#3b82f6", bg: "#eff6ff", Icon: Calendar },
                  { label: "Projetos",   href: "/projetos",   color: "#ec4899", bg: "#fdf2f8", Icon: FolderKanban },
                ].map(({ label, href, color, bg, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:opacity-90 transition-opacity"
                    style={{ background: bg }}
                  >
                    <Icon className="w-4 h-4" style={{ color }} />
                    <span className="text-xs font-medium" style={{ color }}>{label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 flex flex-col items-center justify-center text-center min-h-[120px]">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300 mb-1">Em breve</p>
              <p className="text-sm font-medium text-gray-400">WhatsApp Assistente</p>
              <p className="text-xs text-gray-300 mt-1 max-w-xs">
                Registre tarefas, pagamentos e ideias direto pelo WhatsApp
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

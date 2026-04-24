"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckSquare, DollarSign, Users, AlertTriangle,
  Loader2, Check, Circle, ArrowRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type TodoTask = {
  id: string;
  title: string;
  dueDate: string | null;
  type: string;
  client: { id: string; name: string } | null;
};

type Summary = {
  todayTasks: TodoTask[];
  overdueTasks: number;
  activeStudents: number;
  pendingFinancial: number;
};

const TYPE_COLORS: Record<string, string> = {
  general:        "#6366f1",
  student:        "#10b981",
  financial:      "#f59e0b",
  content:        "#3b82f6",
  administrative: "#8b5cf6",
};

const TYPE_BG: Record<string, string> = {
  general:        "#eef2ff",
  student:        "#f0fdf4",
  financial:      "#fffbeb",
  content:        "#eff6ff",
  administrative: "#f5f3ff",
};

const TYPE_LABELS: Record<string, string> = {
  general: "Geral", student: "Aluno", financial: "Financeiro",
  content: "Conteúdo", administrative: "Adm",
};

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

export default function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<Set<string>>(new Set());

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
    setSummary((prev) =>
      prev ? { ...prev, todayTasks: prev.todayTasks.filter((t) => t.id !== id) } : prev
    );
    setCompleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  const hasAlerts = summary && (summary.overdueTasks > 0 || summary.pendingFinancial > 0);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Tarefas hoje",
                value: summary?.todayTasks.length ?? 0,
                icon: CheckSquare,
                color: "#6366f1",
                bg: "#eef2ff",
                href: "/tarefas",
              },
              {
                label: "Alunos ativos",
                value: summary?.activeStudents ?? 0,
                icon: Users,
                color: "#10b981",
                bg: "#f0fdf4",
                href: "/alunos",
              },
              {
                label: "Financeiro pendente",
                value: summary?.pendingFinancial ?? 0,
                icon: DollarSign,
                color: "#f59e0b",
                bg: "#fffbeb",
                href: "/financeiro",
              },
              {
                label: "Atrasadas",
                value: summary?.overdueTasks ?? 0,
                icon: AlertTriangle,
                color: summary?.overdueTasks ? "#ef4444" : "#94a3b8",
                bg: summary?.overdueTasks ? "#fef2f2" : "#f8fafc",
                href: "/tarefas",
              },
            ].map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-shadow"
                style={{ background: stat.bg }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">{stat.label}</span>
                  <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
                <p className="text-2xl font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Today's tasks */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">Tarefas de hoje</h2>
                <Link href="/tarefas" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  Ver todas <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-3">
                {summary?.todayTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-2">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                    <p className="text-sm text-gray-400">Nada para hoje.</p>
                    <Link href="/tarefas" className="text-xs text-indigo-500 mt-1">Criar tarefa</Link>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {summary?.todayTasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-3 px-2 py-2 hover:bg-gray-50 rounded-xl group/t transition-colors">
                        <button
                          onClick={() => handleComplete(task.id)}
                          disabled={completing.has(task.id)}
                          className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-indigo-500 flex items-center justify-center transition-colors"
                        >
                          {completing.has(task.id) && (
                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Alerts + Quick access */}
            <div className="space-y-4">
              {/* Alerts */}
              {hasAlerts && (
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm">
                  <div className="px-5 py-4 border-b border-red-50">
                    <h2 className="font-semibold text-red-600 text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Atenção
                    </h2>
                  </div>
                  <div className="p-4 space-y-3">
                    {(summary?.overdueTasks ?? 0) > 0 && (
                      <Link href="/tarefas" className="flex items-center justify-between p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-red-700">Tarefas atrasadas</p>
                          <p className="text-xs text-red-500">{summary?.overdueTasks} tarefa{(summary?.overdueTasks ?? 0) !== 1 ? "s" : ""} em atraso</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-red-400" />
                      </Link>
                    )}
                    {(summary?.pendingFinancial ?? 0) > 0 && (
                      <Link href="/financeiro" className="flex items-center justify-between p-3 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-amber-700">Cobranças pendentes</p>
                          <p className="text-xs text-amber-500">{summary?.pendingFinancial} entrada{(summary?.pendingFinancial ?? 0) !== 1 ? "s" : ""} vencida{(summary?.pendingFinancial ?? 0) !== 1 ? "s" : ""}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-amber-400" />
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Quick access */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="font-semibold text-gray-800 text-sm">Acesso rápido</h2>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  {[
                    { label: "Tarefas",   href: "/tarefas",   color: "#6366f1", bg: "#eef2ff",  icon: CheckSquare },
                    { label: "Alunos",    href: "/alunos",    color: "#10b981", bg: "#f0fdf4",  icon: Users },
                    { label: "Financeiro",href: "/financeiro",color: "#f59e0b", bg: "#fffbeb",  icon: DollarSign },
                    { label: "CRM",       href: "/crm",       color: "#8b5cf6", bg: "#f5f3ff",  icon: Circle },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 p-3 rounded-xl hover:opacity-90 transition-opacity"
                      style={{ background: item.bg }}
                    >
                      <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      <span className="text-sm font-medium" style={{ color: item.color }}>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Placeholder: WhatsApp Assistente */}
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-300 mb-1">Em breve</p>
                <p className="text-sm text-gray-400">WhatsApp Assistente</p>
                <p className="text-xs text-gray-300 mt-1">Registre tarefas, pagamentos e ideias direto pelo WhatsApp</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

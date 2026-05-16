"use client";

import { useEffect, useState, useCallback } from "react";
import { Phone, Calendar, Clock, RefreshCw, Play, FastForward, Pause, RotateCcw } from "lucide-react";

type Journey = {
  id: string;
  clientId: string;
  stage: string;
  computedStage: string;
  cycleStartDate: string | null;
  currentCycleNumber: number;
  cycleLengthWeeks: number;
  planStartDate: string;
  planExpiresAt: string | null;
  lastContactAt: string | null;
  nextActionAt: string | null;
  isPaused: boolean;
  notes: string | null;
  client: {
    id: string;
    name: string;
    phone: string | null;
    planName: string | null;
    email: string | null;
  };
};

type Action = "iniciar_ciclo" | "iniciar_novo_ciclo" | "postergar_ciclo" | "pausar";

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "alunos_novos",     label: "Alunos Novos",   color: "#6366f1" },
  { key: "semana_1",         label: "Semana 1",        color: "#0ea5e9" },
  { key: "semana_2",         label: "Semana 2",        color: "#10b981" },
  { key: "semana_3",         label: "Semana 3",        color: "#f59e0b" },
  { key: "semana_4",         label: "Semana 4",        color: "#f97316" },
  { key: "semana_5",         label: "Semana 5",        color: "#ef4444" },
  { key: "atualizacao_treino", label: "Atualização",   color: "#8b5cf6" },
  { key: "pausado",          label: "Pausado",         color: "#94a3b8" },
];

function fmt(d: string | null | undefined, fallback = "—") {
  if (!d) return fallback;
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function currentWeek(cycleStartDate: string | null): number | null {
  if (!cycleStartDate) return null;
  const diffDays = (Date.now() - new Date(cycleStartDate).getTime()) / 86_400_000;
  return Math.floor(diffDays / 7) + 1;
}

function JourneyCard({
  journey,
  onAction,
  loading,
}: {
  journey: Journey;
  onAction: (id: string, action: Action) => void;
  loading: string | null;
}) {
  const week = currentWeek(journey.cycleStartDate);
  const isLoading = loading === journey.id;

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3"
      style={{ borderLeft: "3px solid " + (COLUMNS.find((c) => c.key === journey.computedStage)?.color ?? "#e2e8f0") }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{journey.client.name}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{journey.client.planName ?? "—"}</p>
        </div>
        {journey.isPaused && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">pausado</span>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span>Vence {fmt(journey.planExpiresAt)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span>{week !== null ? `Sem. ${week} / ciclo ${journey.currentCycleNumber}` : `Ciclo ${journey.currentCycleNumber}`}</span>
        </div>
        {journey.client.phone && (
          <div className="flex items-center gap-1.5 col-span-2">
            <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <a
              href={`https://wa.me/55${journey.client.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline truncate"
            >
              {journey.client.phone}
            </a>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span>Último: {fmt(journey.lastContactAt)}</span>
        </div>
        {journey.nextActionAt && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-indigo-400 flex-shrink-0" />
            <span className="text-indigo-600">Ação: {fmt(journey.nextActionAt)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-50">
        {!journey.cycleStartDate && !journey.isPaused && (
          <ActionBtn
            icon={<Play className="w-3 h-3" />}
            label="Iniciar"
            onClick={() => onAction(journey.id, "iniciar_ciclo")}
            disabled={isLoading}
            color="#6366f1"
          />
        )}
        {journey.cycleStartDate && !journey.isPaused && (
          <>
            <ActionBtn
              icon={<RotateCcw className="w-3 h-3" />}
              label="Novo ciclo"
              onClick={() => onAction(journey.id, "iniciar_novo_ciclo")}
              disabled={isLoading}
              color="#10b981"
            />
            <ActionBtn
              icon={<FastForward className="w-3 h-3" />}
              label="+1 sem"
              onClick={() => onAction(journey.id, "postergar_ciclo")}
              disabled={isLoading}
              color="#f59e0b"
            />
          </>
        )}
        <ActionBtn
          icon={<Pause className="w-3 h-3" />}
          label={journey.isPaused ? "Retomar" : "Pausar"}
          onClick={() => onAction(journey.id, "pausar")}
          disabled={isLoading}
          color="#94a3b8"
        />
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-opacity disabled:opacity-40"
      style={{ background: color + "18", color }}
    >
      {icon}
      {label}
    </button>
  );
}

export default function CrmAlunosPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/crm-alunos");
      const data = await res.json();
      setJourneys(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAction(id: string, action: Action) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/crm-alunos/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const updated: Journey = await res.json();
      setJourneys((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    } finally {
      setActionLoading(null);
    }
  }

  const grouped = Object.fromEntries(
    COLUMNS.map((col) => [col.key, journeys.filter((j) => j.computedStage === col.key)]),
  );

  const totalActive = journeys.filter((j) => !j.isPaused).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">CRM de Alunos</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? "Carregando..." : `${journeys.length} alunos · ${totalActive} ativos`}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-6 h-full" style={{ minWidth: `${COLUMNS.length * 260}px` }}>
          {COLUMNS.map((col) => {
            const cards = grouped[col.key] ?? [];
            return (
              <div key={col.key} className="flex flex-col flex-shrink-0 w-60">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex-1">
                    {col.label}
                  </span>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: col.color + "20", color: col.color }}
                  >
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1">
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 h-32 animate-pulse" />
                      ))}
                    </div>
                  ) : cards.length === 0 ? (
                    <div className="flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-gray-100">
                      <p className="text-xs text-gray-300">Vazio</p>
                    </div>
                  ) : (
                    cards.map((j) => (
                      <JourneyCard
                        key={j.id}
                        journey={j}
                        onAction={handleAction}
                        loading={actionLoading}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

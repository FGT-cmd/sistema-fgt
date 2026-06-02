"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Loader2, RefreshCw, Bot, Zap,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  Activity, FlaskConical, Radio, LayoutDashboard,
  BookOpen, DollarSign, CheckSquare, Users, FolderKanban,
  FileText, ChevronRight, Filter,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────

type OCEvent = {
  id: string;
  chatId: string;
  source: string;
  rawCommand: string;
  interpretedIntent: string | null;
  executionStatus: string;
  response: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type TelegramStatus = {
  ok: boolean;
  botConfigured: boolean;
  chatConfigured: boolean;
  botUsername?: string | null;
  botFirstName?: string | null;
  error?: string;
  lastEvent?: {
    rawCommand: string;
    createdAt: string;
    executionStatus: string;
  } | null;
};

type Tab = "painel" | "atividade" | "pendentes" | "comandos" | "teste" | "status";
type ActivityFilter = "todos" | "telegram" | "erros" | "aguardando" | "testes";

// ─── Constants ────────────────────────────────────────────────────

const INTENT_LABELS: Record<string, string> = {
  query_pending:     "Consultar pendências",
  create_student:    "Criar aluna",
  register_payment:  "Registrar pagamento",
  create_task:       "Criar tarefa",
  add_student_note:  "Observação de aluna",
  save_content_idea: "Ideia de conteúdo",
  unknown:           "Não entendido",
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  telegram: { label: "Telegram",     color: "bg-blue-50 text-blue-700 border-blue-200" },
  test:     { label: "Teste manual", color: "bg-purple-50 text-purple-700 border-purple-200" },
  system:   { label: "Sistema",      color: "bg-gray-50 text-gray-600 border-gray-200" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  executed:             { label: "Executado",  color: "text-green-700 bg-green-50 border-green-200", Icon: CheckCircle2 },
  waiting_confirmation: { label: "Aguardando", color: "text-amber-700 bg-amber-50 border-amber-200", Icon: Clock },
  failed:               { label: "Falhou",     color: "text-red-700 bg-red-50 border-red-200",       Icon: XCircle },
  cancelled:            { label: "Cancelado",  color: "text-gray-500 bg-gray-50 border-gray-200",    Icon: XCircle },
  received:             { label: "Recebido",   color: "text-blue-700 bg-blue-50 border-blue-200",    Icon: Clock },
};

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "painel",    label: "Painel",       Icon: LayoutDashboard },
  { id: "atividade", label: "Atividade",    Icon: Activity },
  { id: "pendentes", label: "Aguardando",   Icon: Clock },
  { id: "comandos",  label: "Comandos",     Icon: BookOpen },
  { id: "teste",     label: "Teste manual", Icon: FlaskConical },
  { id: "status",    label: "Status",       Icon: Radio },
];

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "todos",     label: "Todos" },
  { id: "telegram",  label: "Telegram" },
  { id: "erros",     label: "Erros" },
  { id: "aguardando", label: "Aguardando" },
  { id: "testes",    label: "Testes" },
];

const COMMANDS = [
  {
    area: "Financeiro",
    icon: DollarSign,
    color: "text-amber-600",
    bg: "bg-amber-50",
    commands: [
      "Quem não pagou?",
      "Pagamentos atrasados",
      "O que vence hoje?",
      "Resumo financeiro do dia",
    ],
  },
  {
    area: "Tarefas",
    icon: CheckSquare,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    commands: [
      "Tarefas de hoje",
      "Criar tarefa para amanhã: cobrar Ana",
      "Me lembra sexta de revisar treino da Júlia",
    ],
  },
  {
    area: "Alunos",
    icon: Users,
    color: "text-green-600",
    bg: "bg-green-50",
    commands: [
      "Criar aluna Maria, plano anual",
      "Buscar aluno Ana",
      "Salvar observação na Ana: relatou dor no joelho",
    ],
  },
  {
    area: "CRM",
    icon: FolderKanban,
    color: "text-blue-600",
    bg: "bg-blue-50",
    commands: [
      "Criar lead Bruna, veio do Instagram",
      "Listar leads sem resposta",
      "Follow-ups de hoje",
    ],
  },
  {
    area: "Fiscal",
    icon: FileText,
    color: "text-rose-600",
    bg: "bg-rose-50",
    commands: [
      "Notas pendentes",
      "Emitir nota da Ana",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// ─── Sub-components ───────────────────────────────────────────────

function EventCard({ ev }: { ev: OCEvent }) {
  const cfg = STATUS_CONFIG[ev.executionStatus] ?? STATUS_CONFIG.received;
  const src = SOURCE_LABELS[ev.source] ?? { label: ev.source, color: "bg-gray-50 text-gray-600 border-gray-200" };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-medium text-gray-800 flex-1 min-w-0">"{ev.rawCommand}"</p>
        <span className="text-xs text-gray-400 shrink-0 tabular-nums">{fmtDatetime(ev.createdAt)}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${src.color}`}>{src.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.color}`}>
          <cfg.Icon className="w-3 h-3" />{cfg.label}
        </span>
        {ev.interpretedIntent && ev.interpretedIntent !== "unknown" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            {INTENT_LABELS[ev.interpretedIntent] ?? ev.interpretedIntent}
          </span>
        )}
      </div>
      {ev.response && (
        <p className="mt-2 pl-3 border-l-2 border-gray-100 text-xs text-gray-500 line-clamp-3">{ev.response}</p>
      )}
      {ev.errorMessage && (
        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {ev.errorMessage}
        </p>
      )}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Bot className="w-8 h-8 mb-2 text-gray-300" />
      <p className="text-sm">{message}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function AutomacoesPage() {
  const [tab, setTab]               = useState<Tab>("painel");
  const [events, setEvents]         = useState<OCEvent[]>([]);
  const [pending, setPending]       = useState<OCEvent[]>([]);
  const [loadingEvents, setLoadingEvents]   = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [loadingStatus, setLoadingStatus]   = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("todos");

  // Teste manual
  const [testInput, setTestInput]   = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ response: string; intent?: string; waitingConfirmation?: boolean } | null>(null);
  const [testError, setTestError]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadEvents = useCallback(async (silent = false) => {
    if (!silent) setLoadingEvents(true);
    try {
      const res  = await fetch("/api/openclaw/events?limit=100");
      const data = await res.json();
      const all: OCEvent[] = Array.isArray(data) ? data : [];
      setEvents(all);
      setPending(all.filter(e => e.executionStatus === "waiting_confirmation"));
    } finally {
      if (!silent) setLoadingEvents(false);
    }
  }, []);

  const loadTelegramStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res  = await fetch("/api/telegram");
      const data = await res.json();
      setTelegramStatus(data);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Carrega ao trocar de aba
  useEffect(() => {
    if (tab === "painel" || tab === "atividade" || tab === "pendentes") loadEvents();
    if (tab === "painel" || tab === "status") loadTelegramStatus();
  }, [tab, loadEvents, loadTelegramStatus]);

  // Auto-refresh a cada 10s nas abas de monitoramento
  useEffect(() => {
    if (tab !== "atividade" && tab !== "painel") return;
    const id = setInterval(() => loadEvents(true), 10_000);
    return () => clearInterval(id);
  }, [tab, loadEvents]);

  async function runTest() {
    const msg = testInput.trim();
    if (!msg || testSending) return;
    setTestSending(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res  = await fetch("/api/openclaw/test", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: msg, chatId: "test-ui" }),
      });
      const data = await res.json();
      setTestResult(data);
      await loadEvents(true);
    } catch {
      setTestError("Erro de conexão. Verifique se o servidor está rodando.");
    } finally {
      setTestSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function useCommand(cmd: string) {
    setTestInput(cmd);
    setTab("teste");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // Derived stats
  const execucoesHoje   = events.filter(e => isToday(e.createdAt)).length;
  const errosHoje       = events.filter(e => isToday(e.createdAt) && e.executionStatus === "failed").length;
  const aguardandoCount = pending.length;
  const ultimaTelegram  = events.find(e => e.source === "telegram") ?? null;
  const ultimoErro      = events.find(e => e.executionStatus === "failed") ?? null;

  const isTelegramActive = telegramStatus?.ok && telegramStatus?.botConfigured;

  const filteredEvents = (() => {
    switch (activityFilter) {
      case "telegram":   return events.filter(e => e.source === "telegram");
      case "erros":      return events.filter(e => e.executionStatus === "failed");
      case "aguardando": return events.filter(e => e.executionStatus === "waiting_confirmation");
      case "testes":     return events.filter(e => e.source === "test");
      default:           return events;
    }
  })();

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-600">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Automações</h1>
              <p className="text-xs text-gray-400">Telegram e automações do Sistema FGT</p>
            </div>
          </div>

          {/* Summary badges */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${
              isTelegramActive
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-gray-50 border-gray-200 text-gray-500"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isTelegramActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              {isTelegramActive ? `@${telegramStatus?.botUsername ?? "bot"} ativo` : "Telegram não verificado"}
            </div>

            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-700">
              <Activity className="w-3.5 h-3.5" />
              {execucoesHoje} hoje
            </div>

            {aguardandoCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-amber-50 border-amber-200 text-amber-700">
                <Clock className="w-3.5 h-3.5" />
                {aguardandoCount} aguardando
              </div>
            )}

            {errosHoje > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-red-50 border-red-200 text-red-700">
                <AlertTriangle className="w-3.5 h-3.5" />
                {errosHoje} erro{errosHoje !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {id === "pendentes" && pending.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab === id ? "bg-white/30 text-white" : "bg-amber-100 text-amber-700"
                }`}>
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Painel ───────────────────────────────────────────── */}
      {tab === "painel" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl space-y-4">

            {/* Telegram status */}
            <div className={`rounded-xl border p-5 ${
              isTelegramActive
                ? "bg-green-50 border-green-200"
                : telegramStatus?.botConfigured === false
                  ? "bg-red-50 border-red-200"
                  : "bg-gray-50 border-gray-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isTelegramActive ? "bg-green-100" : "bg-gray-100"
                }`}>
                  {isTelegramActive
                    ? <CheckCircle2 className="w-5 h-5 text-green-700" />
                    : <Bot className="w-5 h-5 text-gray-400" />
                  }
                </div>
                <div className="flex-1">
                  <p className={`font-semibold text-sm ${isTelegramActive ? "text-green-800" : "text-gray-700"}`}>
                    {isTelegramActive
                      ? `Telegram conectado · @${telegramStatus?.botUsername ?? "bot"}`
                      : "Telegram não verificado"}
                  </p>
                  {telegramStatus?.botFirstName && isTelegramActive && (
                    <p className="text-xs text-green-700 mt-0.5">{telegramStatus.botFirstName}</p>
                  )}
                  {telegramStatus?.error && (
                    <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {telegramStatus.error}
                    </p>
                  )}
                </div>
                <button
                  onClick={loadTelegramStatus}
                  disabled={loadingStatus}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingStatus ? "animate-spin" : ""}`} />
                  Verificar conexão
                </button>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-3xl font-bold text-gray-900">{execucoesHoje}</p>
                <p className="text-xs text-gray-500 mt-1">Execuções hoje</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className={`text-3xl font-bold ${errosHoje > 0 ? "text-red-600" : "text-gray-900"}`}>{errosHoje}</p>
                <p className="text-xs text-gray-500 mt-1">Erros hoje</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className={`text-3xl font-bold ${aguardandoCount > 0 ? "text-amber-600" : "text-gray-900"}`}>{aguardandoCount}</p>
                <p className="text-xs text-gray-500 mt-1">Aguardando confirmação</p>
              </div>
            </div>

            {/* Última mensagem Telegram */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Última mensagem do Telegram</p>
              {ultimaTelegram ? (
                <>
                  <p className="text-sm text-gray-800 font-medium">"{ultimaTelegram.rawCommand}"</p>
                  <div className="flex items-center gap-2 mt-2">
                    {(() => {
                      const cfg = STATUS_CONFIG[ultimaTelegram.executionStatus] ?? STATUS_CONFIG.received;
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.color}`}>
                          <cfg.Icon className="w-3 h-3" />{cfg.label}
                        </span>
                      );
                    })()}
                    <span className="text-xs text-gray-400">{fmtDatetime(ultimaTelegram.createdAt)}</span>
                  </div>
                  {ultimaTelegram.response && (
                    <p className="mt-2 text-xs text-gray-500 pl-3 border-l-2 border-gray-100 line-clamp-2">{ultimaTelegram.response}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">Nenhuma mensagem Telegram registrada ainda.</p>
              )}
            </div>

            {/* Último erro */}
            {ultimoErro && (
              <div className="bg-red-50 rounded-xl border border-red-100 p-4">
                <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-3">Último erro</p>
                <p className="text-sm text-gray-800 font-medium">"{ultimoErro.rawCommand}"</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    (SOURCE_LABELS[ultimoErro.source] ?? { color: "bg-gray-50 text-gray-600 border-gray-200" }).color
                  }`}>
                    {(SOURCE_LABELS[ultimoErro.source] ?? { label: ultimoErro.source }).label}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDatetime(ultimoErro.createdAt)}</span>
                </div>
                {ultimoErro.errorMessage && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {ultimoErro.errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Dica quando bot ativo */}
            {isTelegramActive && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
                <Zap className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700">
                  Bot ativo. Envie um comando pelo Telegram e acompanhe na aba <strong>Atividade</strong>.
                  Para ver os comandos disponíveis, acesse <strong>Comandos</strong>.
                </p>
              </div>
            )}

            {/* Estado vazio */}
            {events.length === 0 && !loadingEvents && (
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center shadow-sm">
                <Bot className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhuma execução registrada ainda.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Envie uma mensagem pelo Telegram ou use a aba <strong>Teste manual</strong>.
                </p>
              </div>
            )}

            {loadingEvents && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Atividade Recente ────────────────────────────────── */}
      {tab === "atividade" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">Atividade recente</h2>
                <p className="text-xs text-gray-400 mt-0.5">Atualiza automaticamente a cada 10 segundos</p>
              </div>
              <button
                onClick={() => loadEvents()}
                disabled={loadingEvents}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              {ACTIVITY_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActivityFilter(f.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    activityFilter === f.id
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loadingEvents ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : filteredEvents.length === 0 ? (
              activityFilter === "telegram" ? (
                <EmptyState
                  message="Nenhum comando real recebido pelo Telegram ainda."
                  sub="Envie uma mensagem pelo Telegram e acompanhe aqui."
                />
              ) : (
                <EmptyState
                  message="Nenhum evento encontrado."
                  sub={activityFilter === "todos" ? "Envie uma mensagem pelo Telegram ou use a aba Teste manual." : undefined}
                />
              )
            ) : (
              <div className="space-y-3">
                {filteredEvents.map(ev => <EventCard key={ev.id} ev={ev} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Aguardando Confirmação ───────────────────────────── */}
      {tab === "pendentes" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 max-w-3xl">
            <h2 className="font-semibold text-gray-800">Aguardando confirmação</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Comandos que requerem confirmação antes de serem executados.
            </p>
          </div>

          {pending.length === 0 ? (
            <EmptyState
              message="Nenhuma ação aguardando confirmação."
              sub="Comandos como criar aluna ou registrar pagamento podem gerar confirmações."
            />
          ) : (
            <div className="space-y-3 max-w-3xl">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Como confirmar</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Responda <strong>sim</strong> pelo Telegram para confirmar ou <strong>cancelar</strong> para cancelar.
                    A confirmação via interface será adicionada em uma próxima fase.
                  </p>
                </div>
              </div>

              {pending.map(ev => {
                const src = SOURCE_LABELS[ev.source] ?? { label: ev.source, color: "bg-gray-50 text-gray-600 border-gray-200" };
                return (
                  <div key={ev.id} className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm font-medium text-gray-800 flex-1">"{ev.rawCommand}"</p>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">{fmtDatetime(ev.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${src.color}`}>{src.label}</span>
                      {ev.interpretedIntent && ev.interpretedIntent !== "unknown" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {INTENT_LABELS[ev.interpretedIntent] ?? ev.interpretedIntent}
                        </span>
                      )}
                    </div>
                    {ev.response && (
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                        <p className="text-xs text-amber-800 font-medium mb-1">Mensagem do bot:</p>
                        <p className="text-xs text-amber-700">{ev.response}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Comandos disponíveis ─────────────────────────────── */}
      {tab === "comandos" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl">
            <div className="mb-5">
              <h2 className="font-semibold text-gray-800">Comandos disponíveis</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Envie pelo Telegram ou clique para testar no motor de intenções.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {COMMANDS.map(({ area, icon: Icon, color, bg, commands }) => (
                <div key={area} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{area}</p>
                  </div>
                  <div className="space-y-1">
                    {commands.map(cmd => (
                      <button
                        key={cmd}
                        onClick={() => useCommand(cmd)}
                        className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 group transition-colors"
                      >
                        <span>"{cmd}"</span>
                        <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Teste Manual ─────────────────────────────────────── */}
      {tab === "teste" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            <h2 className="font-semibold text-gray-800 mb-1">Teste manual</h2>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3 mb-6">
              <FlaskConical className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-purple-800">Uso interno para testes</p>
                <p className="text-xs text-purple-700 mt-0.5">
                  Comandos enviados aqui não vêm do Telegram. O motor processa e grava o resultado
                  como <strong>Teste manual</strong> na aba Atividade.
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-2">Comando em linguagem natural</label>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={testInput}
                  onChange={e => setTestInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runTest(); } }}
                  placeholder="Ex: Quem não pagou? · Julia pagou 300 · Criar tarefa amanhã"
                  className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
                  disabled={testSending}
                  autoFocus
                />
                <button
                  onClick={runTest}
                  disabled={testSending || !testInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: testInput.trim() ? "#6366f1" : "#e5e7eb", color: testInput.trim() ? "#fff" : "#9ca3af" }}
                >
                  {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Testar
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {["Quem não pagou?", "Resumo do dia", "Julia pagou 300 hoje no pix", "Criar tarefa sexta", "Observação da Ana: fome à noite"].map(s => (
                <button
                  key={s}
                  onClick={() => { setTestInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors bg-white"
                >
                  {s}
                </button>
              ))}
            </div>

            {testError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> {testError}
                </p>
              </div>
            )}

            {testResult && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-800">Resultado do motor</span>
                  {testResult.intent && testResult.intent !== "unknown" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {INTENT_LABELS[testResult.intent] ?? testResult.intent}
                    </span>
                  )}
                  {testResult.waitingConfirmation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> aguardando confirmação
                    </span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
                  {testResult.response}
                </div>
                <p className="text-xs text-gray-400">
                  Evento gravado como{" "}
                  <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                    Teste manual
                  </span>{" "}
                  — visível na aba Atividade.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Status Telegram ──────────────────────────────────── */}
      {tab === "status" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">Status do Telegram</h2>
                <p className="text-xs text-gray-400 mt-0.5">Verificação em tempo real via API do Telegram</p>
              </div>
              <button
                onClick={loadTelegramStatus}
                disabled={loadingStatus}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
                Verificar conexão
              </button>
            </div>

            {loadingStatus ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : !telegramStatus ? (
              <EmptyState message="Clique em Verificar conexão para checar o status." />
            ) : (
              <div className="space-y-4">
                <div className={`rounded-xl border p-5 ${
                  telegramStatus.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      telegramStatus.ok ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {telegramStatus.ok
                        ? <CheckCircle2 className="w-4 h-4 text-green-700" />
                        : <XCircle className="w-4 h-4 text-red-700" />
                      }
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${telegramStatus.ok ? "text-green-800" : "text-red-800"}`}>
                        {telegramStatus.ok ? "Bot conectado" : "Bot desconectado"}
                      </p>
                      {telegramStatus.ok && telegramStatus.botUsername && (
                        <p className="text-xs text-green-700">@{telegramStatus.botUsername} · {telegramStatus.botFirstName}</p>
                      )}
                    </div>
                  </div>
                  {telegramStatus.error && (
                    <p className="text-xs text-red-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {telegramStatus.error}
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Configuração</p>
                  {[
                    { label: "TELEGRAM_BOT_TOKEN", ok: telegramStatus.botConfigured },
                    { label: "TELEGRAM_ALLOWED_CHAT", ok: telegramStatus.chatConfigured, warn: true },
                  ].map(({ label, ok, warn }) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{label}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        ok
                          ? "bg-green-50 text-green-700 border-green-200"
                          : warn
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                      }`}>
                        {ok ? "Configurado" : "Não configurado"}
                      </span>
                    </div>
                  ))}
                </div>

                {telegramStatus.lastEvent ? (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Última mensagem recebida</p>
                    <p className="text-sm text-gray-800">"{telegramStatus.lastEvent.rawCommand}"</p>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const cfg = STATUS_CONFIG[telegramStatus.lastEvent.executionStatus] ?? STATUS_CONFIG.received;
                        return (
                          <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.color}`}>
                            <cfg.Icon className="w-3 h-3" />{cfg.label}
                          </span>
                        );
                      })()}
                      <span className="text-xs text-gray-400">{fmtDatetime(telegramStatus.lastEvent.createdAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Última mensagem recebida</p>
                    <p className="text-sm text-gray-400">Nenhuma mensagem Telegram registrada ainda.</p>
                  </div>
                )}

                {!telegramStatus.botConfigured && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Como configurar</p>
                    <ol className="space-y-1.5 text-xs text-gray-600">
                      <li>1. Crie um bot via <strong>@BotFather</strong> no Telegram</li>
                      <li>2. Adicione ao <code className="bg-gray-100 px-1 rounded">.env</code>:
                        <div className="mt-1 space-y-1">
                          <code className="block bg-gray-100 px-2 py-1 rounded text-gray-700">TELEGRAM_BOT_TOKEN=...</code>
                          <code className="block bg-gray-100 px-2 py-1 rounded text-gray-700">TELEGRAM_ALLOWED_CHAT=...</code>
                        </div>
                      </li>
                      <li>3. Configure o webhook:
                        <code className="block mt-1 bg-gray-100 px-2 py-1 rounded text-gray-700 break-all">
                          curl "https://api.telegram.org/bot&lt;TOKEN&gt;/setWebhook?url=&lt;URL&gt;/api/telegram"
                        </code>
                      </li>
                    </ol>
                  </div>
                )}

                {telegramStatus.ok && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
                    <Zap className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-indigo-700">
                      Bot ativo e recebendo mensagens. Envie um comando pelo Telegram e acompanhe na aba <strong>Atividade</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

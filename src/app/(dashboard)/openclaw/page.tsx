"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Loader2, RefreshCw, Bot, Zap,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  Activity, FlaskConical, Radio,
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

type Tab = "atividade" | "pendentes" | "teste" | "status";

// ─── Helpers ──────────────────────────────────────────────────────

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
  telegram: { label: "Telegram", color: "bg-blue-50 text-blue-700 border-blue-200" },
  test:     { label: "Teste",    color: "bg-purple-50 text-purple-700 border-purple-200" },
  system:   { label: "Sistema",  color: "bg-gray-50 text-gray-600 border-gray-200" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  executed:             { label: "Executado",  color: "text-green-700 bg-green-50 border-green-200", Icon: CheckCircle2 },
  waiting_confirmation: { label: "Aguardando", color: "text-amber-700 bg-amber-50 border-amber-200", Icon: Clock },
  failed:               { label: "Falhou",     color: "text-red-700 bg-red-50 border-red-200",       Icon: XCircle },
  cancelled:            { label: "Cancelado",  color: "text-gray-500 bg-gray-50 border-gray-200",    Icon: XCircle },
  received:             { label: "Recebido",   color: "text-blue-700 bg-blue-50 border-blue-200",    Icon: Clock },
};

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "atividade", label: "Atividade recente", Icon: Activity },
  { id: "pendentes", label: "Aguardando confirmação", Icon: Clock },
  { id: "teste",     label: "Teste manual",      Icon: FlaskConical },
  { id: "status",    label: "Status Telegram",   Icon: Radio },
];

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
          <cfg.Icon className="w-3 h-3" />
          {cfg.label}
        </span>
        {ev.interpretedIntent && ev.interpretedIntent !== "unknown" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            {INTENT_LABELS[ev.interpretedIntent] ?? ev.interpretedIntent}
          </span>
        )}
      </div>

      {ev.response && (
        <p className="mt-2 pl-3 border-l-2 border-gray-100 text-xs text-gray-500 line-clamp-3">
          {ev.response}
        </p>
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

export default function OpenClawPage() {
  const [tab, setTab]                 = useState<Tab>("atividade");
  const [events, setEvents]           = useState<OCEvent[]>([]);
  const [pending, setPending]         = useState<OCEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [loadingStatus, setLoadingStatus]   = useState(false);

  // Teste manual state
  const [testInput, setTestInput]     = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult]   = useState<{ response: string; intent?: string; waitingConfirmation?: boolean } | null>(null);
  const [testError, setTestError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadEvents = useCallback(async (silent = false) => {
    if (!silent) setLoadingEvents(true);
    try {
      const res = await fetch("/api/openclaw/events?limit=40");
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
      const res = await fetch("/api/telegram");
      const data = await res.json();
      setTelegramStatus(data);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Carrega eventos na abertura e quando troca para abas que usam eventos
  useEffect(() => {
    if (tab === "atividade" || tab === "pendentes") loadEvents();
    if (tab === "status") loadTelegramStatus();
  }, [tab, loadEvents, loadTelegramStatus]);

  // Carrega status do Telegram no header
  useEffect(() => {
    fetch("/api/telegram").then(r => r.json()).then(d => setTelegramStatus(d)).catch(() => {});
  }, []);

  // Auto-refresh a cada 10s quando na aba atividade
  useEffect(() => {
    if (tab !== "atividade") return;
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
      const res = await fetch("/api/openclaw/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, chatId: "test-ui" }),
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

  const isTelegramActive = telegramStatus?.ok && telegramStatus?.botConfigured;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-600">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Central Operacional · OpenClaw</h1>
              <p className="text-xs text-gray-400">Monitoramento do bot Telegram · Sistema FGT</p>
            </div>
          </div>

          {/* Telegram badge */}
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${
            isTelegramActive
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-gray-50 border-gray-200 text-gray-500"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isTelegramActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {isTelegramActive
              ? `@${telegramStatus?.botUsername ?? "bot"} ativo`
              : "Telegram não verificado"}
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

      {/* ── Tab: Atividade Recente ────────────────────────────────── */}
      {tab === "atividade" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4 max-w-3xl">
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

          {loadingEvents ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              message="Nenhum evento registrado ainda."
              sub="Envie uma mensagem pelo Telegram ou use a aba Teste manual."
            />
          ) : (
            <div className="space-y-3 max-w-3xl">
              {events.map(ev => <EventCard key={ev.id} ev={ev} />)}
            </div>
          )}
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
              {/* Instrução */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Como confirmar</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Para confirmar uma ação, responda <strong>sim</strong> pelo Telegram. Para cancelar, responda <strong>cancelar</strong>.
                    A confirmação via UI será adicionada em uma próxima fase.
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
                        <p className="text-xs text-amber-800 font-medium mb-1">Mensagem enviada ao bot:</p>
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

      {/* ── Tab: Teste Manual ─────────────────────────────────────── */}
      {tab === "teste" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            <h2 className="font-semibold text-gray-800 mb-1">Teste manual do engine</h2>

            {/* Aviso */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3 mb-6">
              <FlaskConical className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-purple-800">Modo de teste — não envia ao Telegram</p>
                <p className="text-xs text-purple-700 mt-0.5">
                  Este campo testa o engine de classificação de intenções dentro do sistema.
                  O comando será processado e gravado com source <strong>test</strong>, mas nenhuma mensagem será enviada ao Telegram.
                </p>
              </div>
            </div>

            {/* Input */}
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

            {/* Sugestões */}
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

            {/* Resultado */}
            {testError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> {testError}
                </p>
              </div>
            )}

            {testResult && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-800">Resultado do engine</span>
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
                  Evento gravado com source <code className="bg-gray-100 px-1 rounded">test</code> — visível na aba Atividade recente.
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
                <h2 className="font-semibold text-gray-800">Status do bot Telegram</h2>
                <p className="text-xs text-gray-400 mt-0.5">Verificação em tempo real via API do Telegram</p>
              </div>
              <button
                onClick={loadTelegramStatus}
                disabled={loadingStatus}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
                Verificar
              </button>
            </div>

            {loadingStatus ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : !telegramStatus ? (
              <EmptyState message="Clique em Verificar para checar o status." />
            ) : (
              <div className="space-y-4">
                {/* Status card */}
                <div className={`rounded-xl border p-5 ${
                  telegramStatus.ok
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
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

                {/* Config */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Configuração</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">TELEGRAM_BOT_TOKEN</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      telegramStatus.botConfigured
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}>
                      {telegramStatus.botConfigured ? "Configurado" : "Não configurado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">TELEGRAM_ALLOWED_CHAT</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      telegramStatus.chatConfigured
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {telegramStatus.chatConfigured ? "Configurado" : "Não configurado"}
                    </span>
                  </div>
                </div>

                {/* Último evento */}
                {telegramStatus.lastEvent ? (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Última mensagem recebida</p>
                    <p className="text-sm text-gray-800">"{telegramStatus.lastEvent.rawCommand}"</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                        (STATUS_CONFIG[telegramStatus.lastEvent.executionStatus] ?? STATUS_CONFIG.received).color
                      }`}>
                        {(() => {
                          const cfg = STATUS_CONFIG[telegramStatus.lastEvent.executionStatus] ?? STATUS_CONFIG.received;
                          return <><cfg.Icon className="w-3 h-3" />{cfg.label}</>;
                        })()}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDatetime(telegramStatus.lastEvent.createdAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Última mensagem recebida</p>
                    <p className="text-sm text-gray-400">Nenhuma mensagem Telegram registrada ainda.</p>
                  </div>
                )}

                {/* Webhook info */}
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
                      Bot ativo e recebendo mensagens. Envie um comando pelo Telegram e acompanhe a execução na aba <strong>Atividade recente</strong>.
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

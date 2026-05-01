"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Loader2, RefreshCw, Trash2, Bot, Zap,
  CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  intent?: string;
  waitingConfirmation?: boolean;
};

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

// ─── Helpers ─────────────────────────────────────────────────────

const INTENT_LABELS: Record<string, string> = {
  query_pending:     "Consultar pendências",
  create_student:    "Criar aluna",
  register_payment:  "Registrar pagamento",
  create_task:       "Criar tarefa",
  add_student_note:  "Observação de aluna",
  save_content_idea: "Ideia de conteúdo",
  unknown:           "Não entendido",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  executed:             { label: "Executado",   color: "text-green-600 bg-green-50 border-green-200",  Icon: CheckCircle2 },
  waiting_confirmation: { label: "Aguardando",  color: "text-amber-600 bg-amber-50 border-amber-200",  Icon: Clock },
  failed:               { label: "Falhou",      color: "text-red-600 bg-red-50 border-red-200",        Icon: XCircle },
  cancelled:            { label: "Cancelado",   color: "text-gray-500 bg-gray-50 border-gray-200",     Icon: XCircle },
  received:             { label: "Recebido",    color: "text-blue-600 bg-blue-50 border-blue-200",     Icon: Clock },
};

const SUGGESTIONS = [
  "Quais pendências hoje?",
  "Quem não pagou?",
  "O que está atrasado?",
  "Resumo do dia",
];

function renderText(text: string) {
  return text.split("\n").map((line, i, arr) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g);
    return (
      <span key={i}>
        {parts.map((part, j) => {
          if (part.startsWith("*") && part.endsWith("*")) return <strong key={j}>{part.slice(1, -1)}</strong>;
          if (part.startsWith("_") && part.endsWith("_")) return <em key={j}>{part.slice(1, -1)}</em>;
          return <span key={j}>{part}</span>;
        })}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

// ─── Main Page ────────────────────────────────────────────────────

export default function OpenClawPage() {
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome",
    role: "assistant",
    text: "Olá! Sou o OpenClaw Assistant. 🤖\n\nEstou conectado ao Sistema FGT e posso:\n\n• *Consultar pendências* — tarefas, pagamentos\n• *Criar aluna* — cadastro + plano + tarefas automáticas\n• *Registrar pagamento* — vincula à parcela\n• *Criar tarefa* — com datas naturais\n• *Salvar observação* — no perfil da aluna\n• *Salvar ideia* — com formato e gancho\n\nDigite em linguagem natural. 👇",
    timestamp: new Date(),
  }]);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [events, setEvents]       = useState<OCEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [tab, setTab]             = useState<"chat" | "logs">("chat");
  const [telegramStatus, setTelegramStatus] = useState<{ botConfigured: boolean; chatConfigured: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    const res = await fetch("/api/openclaw/events?limit=30");
    const data = await res.json();
    setEvents(Array.isArray(data) ? data : []);
    setLoadingEvents(false);
  }, []);

  useEffect(() => {
    // Verifica status do Telegram bot
    fetch("/api/telegram").then(r => r.json()).then(d => setTelegramStatus(d)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "logs") loadEvents();
  }, [tab, loadEvents]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput("");
    setSending(true);

    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`, role: "user", text: msg, timestamp: new Date(),
    }]);

    try {
      const res = await fetch("/api/openclaw/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, chatId: "test-ui" }),
      });
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.response || "Sem resposta.",
        timestamp: new Date(),
        intent: data.intent,
        waitingConfirmation: data.waitingConfirmation,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: "assistant",
        text: "Erro de conexão. Verifique se o servidor está rodando.",
        timestamp: new Date(),
      }]);
    }

    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: "#f8fafc" }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#6366f1" }}>
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">OpenClaw Assistant</h1>
              <p className="text-xs text-gray-400">Assistente operacional via Telegram · Sistema FGT</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Telegram status indicator */}
            {telegramStatus && (
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${telegramStatus.botConfigured && telegramStatus.chatConfigured ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${telegramStatus.botConfigured && telegramStatus.chatConfigured ? "bg-green-500" : "bg-amber-500"}`} />
                {telegramStatus.botConfigured && telegramStatus.chatConfigured ? "Telegram ativo" : "Telegram não configurado"}
              </div>
            )}
            <div className="flex bg-gray-100 rounded-xl p-1">
              {(["chat", "logs"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={tab === t ? { background: "#6366f1", color: "#fff" } : { color: "#6b7280" }}
                >
                  {t === "chat" ? "Chat" : "Logs"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab: Chat ────────────────────────────────────────────── */}
      {tab === "chat" && (
        <div className="flex flex-1 min-h-0">
          {/* Chat area */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 mt-1 flex-shrink-0" style={{ background: "#eef2ff" }}>
                      <Bot className="w-4 h-4" style={{ color: "#6366f1" }} />
                    </div>
                  )}
                  <div className="max-w-xs lg:max-w-md xl:max-w-lg">
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "text-white rounded-br-sm"
                        : "bg-white border border-gray-100 shadow-sm text-gray-800 rounded-bl-sm"
                    }`} style={msg.role === "user" ? { background: "#6366f1" } : {}}>
                      {renderText(msg.text)}
                    </div>
                    <div className={`flex items-center gap-2 mt-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.waitingConfirmation && (
                        <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> aguardando confirmação
                        </span>
                      )}
                      {msg.intent && msg.intent !== "unknown" && (
                        <span className="text-[10px] text-gray-300">{INTENT_LABELS[msg.intent] ?? msg.intent}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center mr-2 mt-1 flex-shrink-0" style={{ background: "#eef2ff" }}>
                    <Bot className="w-4 h-4" style={{ color: "#6366f1" }} />
                  </div>
                  <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {[0, 150, 300].map(delay => (
                        <div key={delay} className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            <div className="px-6 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} disabled={sending}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors bg-white disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-6 pb-5 pt-1">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-2.5">
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Digite um comando em linguagem natural..."
                  className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
                  disabled={sending} autoFocus />
                <button onClick={() => send()} disabled={sending || !input.trim()}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                  style={{ background: input.trim() ? "#6366f1" : "#e5e7eb" }}>
                  {sending
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4" style={{ color: input.trim() ? "#fff" : "#9ca3af" }} />
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Side panel: exemplos + setup */}
          <div className="w-68 shrink-0 border-l border-gray-100 bg-white p-4 hidden xl:flex xl:flex-col gap-4 overflow-y-auto" style={{ width: "272px" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Exemplos</h3>
              <button onClick={() => setMessages([{ id: "clear", role: "assistant", text: "Chat limpo. 👍", timestamp: new Date() }])}
                className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Limpar
              </button>
            </div>

            {[
              { title: "📊 Consultar pendências", items: ["Quem não pagou?", "O que está atrasado?", "Resumo do dia", "Pendências de hoje"] },
              { title: "🎓 Criar aluna", items: ["Crie a aluna Ana Souza, plano semestral", "Cadastrar Bruna Silva, objetivo emagrecimento"] },
              { title: "💰 Registrar pagamento", items: ["Julia pagou 300 hoje no pix", "Ana pagou a parcela de 250"] },
              { title: "📋 Criar tarefa", items: ["Me lembra de cobrar Ana sexta", "Tarefa para revisar check-in da Bruna amanhã"] },
              { title: "📝 Observação", items: ["Observação da Ana: relatou fome à noite", "Bruna vai viajar semana que vem"] },
              { title: "💡 Ideia de conteúdo", items: ["Ideia de conteúdo: mulher que treina e não progride carga"] },
            ].map(({ title, items }) => (
              <div key={title}>
                <p className="text-xs font-semibold text-gray-700 mb-1.5">{title}</p>
                {items.map(item => (
                  <button key={item} onClick={() => send(item)}
                    className="block w-full text-left text-xs text-gray-400 hover:text-indigo-600 py-0.5 truncate transition-colors">
                    → {item}
                  </button>
                ))}
              </div>
            ))}

            {/* Telegram setup */}
            {telegramStatus && !telegramStatus.botConfigured && (
              <div className="mt-auto pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Telegram não configurado
                </p>
                <div className="text-[10px] text-gray-400 space-y-1">
                  <p>1. Crie bot no @BotFather</p>
                  <p>2. Adicione ao .env:</p>
                  <code className="block bg-gray-50 px-2 py-1 rounded text-gray-600">TELEGRAM_BOT_TOKEN=...</code>
                  <code className="block bg-gray-50 px-2 py-1 rounded text-gray-600">TELEGRAM_ALLOWED_CHAT=...</code>
                  <p>3. Configure o webhook</p>
                </div>
              </div>
            )}

            {telegramStatus?.botConfigured && (
              <div className="mt-auto pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Telegram ativo
                </p>
                <p className="text-[10px] text-gray-400">Envie mensagens diretamente pelo bot no Telegram para usar em produção.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Logs ────────────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Log de eventos OpenClaw</h2>
            <button onClick={loadEvents} disabled={loadingEvents}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          {loadingEvents ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Bot className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>Nenhum evento registrado ainda.</p>
              <p className="text-xs mt-1">Envie uma mensagem no chat para começar.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl">
              {events.map(ev => {
                const cfg = STATUS_CONFIG[ev.executionStatus] ?? STATUS_CONFIG.received;
                return (
                  <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">"{ev.rawCommand}"</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ev.interpretedIntent && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                              {INTENT_LABELS[ev.interpretedIntent] ?? ev.interpretedIntent}
                            </span>
                          )}
                          <span className={`text-xs rounded-full px-2 py-0.5 border flex items-center gap-1 ${cfg.color}`}>
                            <cfg.Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                          <span className="text-xs text-gray-400">{ev.source}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(ev.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {ev.response && (
                      <div className="mt-2 pl-3 border-l-2 border-gray-100">
                        <p className="text-xs text-gray-500 line-clamp-3">{ev.response}</p>
                      </div>
                    )}
                    {ev.errorMessage && (
                      <p className="text-xs text-red-400 mt-1">⚠ {ev.errorMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

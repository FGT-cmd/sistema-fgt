"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Loader2, RefreshCw, Trash2, MessageCircle,
  CheckCircle2, XCircle, Clock, AlertTriangle, Bot,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  status?: "waiting_confirmation" | "executed" | "error";
  intent?: string;
};

type WaEvent = {
  id: string;
  phone: string;
  rawContent: string;
  messageType: string;
  interpretedIntent: string | null;
  status: string;
  response: string | null;
  errorMessage: string | null;
  createdAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  executed:             { label: "Executado",    color: "text-green-600 bg-green-50 border-green-200",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  waiting_confirmation: { label: "Aguardando",   color: "text-amber-600 bg-amber-50 border-amber-200",  icon: <Clock className="w-3.5 h-3.5" /> },
  failed:               { label: "Falhou",       color: "text-red-600 bg-red-50 border-red-200",        icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelled:            { label: "Cancelado",    color: "text-gray-500 bg-gray-50 border-gray-200",     icon: <XCircle className="w-3.5 h-3.5" /> },
  received:             { label: "Recebido",     color: "text-blue-600 bg-blue-50 border-blue-200",     icon: <Clock className="w-3.5 h-3.5" /> },
};

const INTENT_LABELS: Record<string, string> = {
  create_task:       "Criar tarefa",
  register_payment:  "Registrar pagamento",
  list_tasks:        "Listar tarefas",
  day_summary:       "Resumo do dia",
  query_pending:     "Pendências",
  create_expense:    "Lançar despesa",
  mark_paid:         "Marcar pago",
  unknown:           "Não entendido",
};

const SUGGESTIONS = [
  "Quais pendências eu tenho hoje?",
  "Quem não pagou?",
  "O que está atrasado?",
  "Resumo do dia",
];

function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Converte texto com *bold* e \n em JSX simples
function renderText(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*[^*]+\*)/g);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          part.startsWith("*") && part.endsWith("*")
            ? <strong key={j}>{part.slice(1, -1)}</strong>
            : <span key={j}>{part}</span>
        )}
        {i < text.split("\n").length - 1 && <br />}
      </span>
    );
  });
}

// ─── Main Page ────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Olá! 👋 Sou o assistente do Sistema FGT.\n\nPosso te ajudar a:\n• Criar tarefas\n• Registrar pagamentos\n• Consultar pendências\n\nDigite uma mensagem para começar.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [events, setEvents]       = useState<WaEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [tab, setTab]             = useState<"chat" | "logs">("chat");
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    const res = await fetch("/api/whatsapp/events?limit=20");
    const data = await res.json();
    setEvents(Array.isArray(data) ? data : []);
    setLoadingEvents(false);
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

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: msg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, phone: "test-ui" }),
      });
      const data = await res.json();

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.response || "Sem resposta.",
        timestamp: new Date(),
        status: data.waitingConfirmation ? "waiting_confirmation" : data.action === "error" ? "error" : "executed",
        intent: data.action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `a-err-${Date.now()}`,
        role: "assistant",
        text: "Erro de conexão. Verifique se o servidor está rodando.",
        timestamp: new Date(),
        status: "error",
      }]);
    }

    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function clearChat() {
    setMessages([{
      id: "welcome",
      role: "assistant",
      text: "Chat limpo. Pode começar! 👋",
      timestamp: new Date(),
    }]);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">WhatsApp Assistant</h1>
            <p className="text-xs text-gray-400">Ambiente de teste local · Sistema FGT</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(["chat", "logs"] as const).map((t) => (
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

      {/* ── Tab: Chat ──────────────────────────────────────── */}
      {tab === "chat" && (
        <div className="flex flex-1 min-h-0">
          {/* Chat area */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <Bot className="w-4 h-4 text-green-600" />
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-md xl:max-w-lg`}>
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-br-sm"
                          : "bg-white border border-gray-100 shadow-sm text-gray-800 rounded-bl-sm"
                      }`}
                    >
                      {renderText(msg.text)}
                    </div>
                    <div className={`flex items-center gap-2 mt-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
                      {msg.status === "waiting_confirmation" && (
                        <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> aguardando confirmação
                        </span>
                      )}
                      {msg.intent && msg.intent !== "unknown" && (
                        <span className="text-[10px] text-gray-300">
                          {INTENT_LABELS[msg.intent] ?? msg.intent}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center mr-2 mt-1">
                    <Bot className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            <div className="px-6 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={sending}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40 bg-white"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-6 pb-5 pt-1">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-2.5">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
                  disabled={sending}
                  autoFocus
                />
                <button
                  onClick={() => send()}
                  disabled={sending || !input.trim()}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                  style={{ background: input.trim() ? "#6366f1" : "#e5e7eb" }}
                >
                  {sending
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Send className="w-4 h-4" style={{ color: input.trim() ? "#fff" : "#9ca3af" }} />
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Side panel: tips */}
          <div className="w-64 shrink-0 border-l border-gray-100 bg-white p-4 hidden xl:block overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dicas</h3>
              <button onClick={clearChat} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Limpar
              </button>
            </div>
            <div className="space-y-3 text-xs text-gray-500">
              <div>
                <p className="font-semibold text-gray-700 mb-1">📋 Criar tarefa</p>
                <p className="text-gray-400">• &quot;Lembrar de revisar check-in da Ana amanhã&quot;</p>
                <p className="text-gray-400">• &quot;Cobrar Julia sexta&quot;</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">💰 Registrar pagamento</p>
                <p className="text-gray-400">• &quot;Julia pagou 300 hoje no pix&quot;</p>
                <p className="text-gray-400">• &quot;Ana pagou a parcela de 250&quot;</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">📊 Consultar</p>
                <p className="text-gray-400">• &quot;Quem não pagou?&quot;</p>
                <p className="text-gray-400">• &quot;O que está vencido?&quot;</p>
                <p className="text-gray-400">• &quot;Resumo do dia&quot;</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">✅ Confirmar / Cancelar</p>
                <p className="text-gray-400">• &quot;sim&quot; ou &quot;ok&quot; para confirmar</p>
                <p className="text-gray-400">• &quot;não&quot; ou &quot;cancelar&quot; para cancelar</p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="font-semibold text-gray-700 mb-1">📅 Datas naturais</p>
                <p className="text-gray-400">hoje · amanhã · sexta · segunda · semana que vem</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Logs ──────────────────────────────────────── */}
      {tab === "logs" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Eventos recentes</h2>
            <button
              onClick={loadEvents}
              disabled={loadingEvents}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5"
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
            <div className="text-center py-16 text-gray-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>Nenhum evento registrado ainda.</p>
              <p className="text-xs mt-1">Envie uma mensagem no chat para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => {
                const cfg = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.received;
                return (
                  <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {ev.rawContent}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ev.interpretedIntent && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                              {INTENT_LABELS[ev.interpretedIntent] ?? ev.interpretedIntent}
                            </span>
                          )}
                          <span className={`text-xs rounded-full px-2 py-0.5 border flex items-center gap-1 ${cfg.color}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(ev.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>

                    {ev.response && (
                      <div className="mt-2 pl-3 border-l-2 border-gray-100">
                        <p className="text-xs text-gray-500 line-clamp-3">
                          {ev.response}
                        </p>
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

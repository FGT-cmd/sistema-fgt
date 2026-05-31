"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Clock, Calendar, ExternalLink,
  RefreshCw, Trash2, X, CheckCircle2, AlertCircle, Users, ListChecks,
} from "lucide-react";
import Link from "next/link";

const DAYS   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Google Calendar colorId → hex
const GCOLOR: Record<string, string> = {
  "1":"#7986cb","2":"#33b679","3":"#8e24aa","4":"#e67c73",
  "5":"#f6c026","6":"#f5511d","7":"#039be5","8":"#616161",
  "9":"#3f51b5","10":"#0b8043","11":"#d60000",
};
const COLOR_OPTIONS = [
  { id:"9",  hex:"#3f51b5" },
  { id:"7",  hex:"#039be5" },
  { id:"2",  hex:"#33b679" },
  { id:"10", hex:"#0b8043" },
  { id:"5",  hex:"#f6c026" },
  { id:"6",  hex:"#f5511d" },
  { id:"4",  hex:"#e67c73" },
  { id:"11", hex:"#d60000" },
  { id:"3",  hex:"#8e24aa" },
  { id:"1",  hex:"#7986cb" },
];

type GEvent = {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  colorId?: string;
  htmlLink?: string;
};

type AlunoOption = { id: string; name: string };

// Vínculo aluno armazenado na description: [FGT:clientId:clientName]
function extractClient(ev: GEvent): { id: string; name: string } | null {
  const m = ev.description?.match(/\[FGT:([^:]+):([^\]]+)\]/);
  if (!m) return null;
  return { id: m[1], name: m[2] };
}

function cleanDescription(desc?: string): string {
  if (!desc) return "";
  return desc.replace(/\[FGT:[^\]]+\]/g, "").trim();
}

function eventDate(e: GEvent): string {
  const raw = e.start.dateTime ?? e.start.date ?? "";
  return raw.slice(0, 10);
}
function eventTime(e: GEvent): string {
  if (!e.start.dateTime) return "";
  return new Date(e.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function eventColor(e: GEvent): string {
  return e.colorId ? (GCOLOR[e.colorId] ?? "#6366f1") : "#6366f1";
}

export default function AgendaPage() {
  const today = new Date();
  const [current, setCurrent] = useState({ month: today.getMonth(), year: today.getFullYear() });
  const [events,   setEvents]   = useState<GEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [authUrl,   setAuthUrl]   = useState("");
  const [notification, setNotification] = useState<{ type: "success"|"error"; msg: string } | null>(null);

  const [form, setForm] = useState({
    summary: "", date: "", timeStart: "", timeEnd: "", description: "", colorId: "9",
    clientId: "", clientName: "",
  });
  const [saving, setSaving] = useState(false);
  const [alunos, setAlunos] = useState<AlunoOption[]>([]);
  const [creatingFollowup, setCreatingFollowup] = useState<string | null>(null);

  // ── Google connection status ──
  useEffect(() => {
    fetch("/api/agenda/google")
      .then(r => r.json())
      .then(d => { setConnected(d.connected); if (d.authUrl) setAuthUrl(d.authUrl); })
      .catch(() => setConnected(false));
  }, []);

  // ── Carregar alunos para o picker ──
  useEffect(() => {
    fetch("/api/alunos")
      .then(r => r.json())
      .then(data => setAlunos(Array.isArray(data) ? data.map((a: AlunoOption) => ({ id: a.id, name: a.name })) : []))
      .catch(() => {});
  }, []);

  // ── Handle OAuth redirect result ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "success") {
      setConnected(true);
      setNotification({ type: "success", msg: "Google Calendar conectado com sucesso!" });
      window.history.replaceState({}, "", "/agenda");
    } else if (google === "error") {
      setNotification({ type: "error", msg: "Falha ao conectar com o Google Calendar." });
      window.history.replaceState({}, "", "/agenda");
    }
  }, []);

  // ── Load events for current month ──
  const loadEvents = useCallback(() => {
    if (!connected) { setLoading(false); return; }
    setLoading(true);
    const start = new Date(current.year, current.month, 1).toISOString();
    const end   = new Date(current.year, current.month + 1, 1).toISOString();
    fetch(`/api/agenda/eventos?timeMin=${start}&timeMax=${end}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setEvents(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [connected, current]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Calendar helpers ──
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
  const firstDay    = new Date(current.year, current.month, 1).getDay();
  const dateStr = (d: number) =>
    `${current.year}-${String(current.month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const isToday = (d: number) =>
    d === today.getDate() && current.month === today.getMonth() && current.year === today.getFullYear();
  const eventsForDay = (d: number) => events.filter(e => eventDate(e) === dateStr(d));
  const selectedEvents = selected ? events.filter(e => eventDate(e) === selected) : [];

  // ── Create event ──
  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.summary || !form.date) return;
    setSaving(true);
    const dateBase = form.date;
    const startDT  = form.timeStart ? `${dateBase}T${form.timeStart}:00` : `${dateBase}T09:00:00`;
    const endDT    = form.timeEnd   ? `${dateBase}T${form.timeEnd}:00`   : `${dateBase}T10:00:00`;

    // Incluir vínculo de aluno na description (parseável depois)
    const clientTag = form.clientId ? `[FGT:${form.clientId}:${form.clientName}]` : "";
    const fullDesc = clientTag
      ? `${clientTag}${form.description ? "\n" + form.description : ""}`
      : form.description;

    const res = await fetch("/api/agenda/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: form.summary, description: fullDesc, start: startDT, end: endDT, colorId: form.colorId }),
    });
    if (res.ok) {
      const created = await res.json();
      setEvents(prev => [...prev, created]);
      setShowForm(false);
      setForm({ summary:"", date:"", timeStart:"", timeEnd:"", description:"", colorId:"9", clientId:"", clientName:"" });
      setNotification({ type: "success", msg: "Evento criado no Google Calendar!" });
    } else {
      setNotification({ type: "error", msg: "Erro ao criar evento." });
    }
    setSaving(false);
  }

  // ── Follow-up task from event ──
  async function handleCreateFollowup(ev: GEvent) {
    setCreatingFollowup(ev.id);
    const client = extractClient(ev);
    const taskTitle = `Follow-up: ${ev.summary}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await fetch("/api/tarefas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskTitle,
        type: client ? "student" : "general",
        clientId: client?.id || null,
        dueDate: tomorrow.toISOString().slice(0, 10),
        source: "automatic",
      }),
    });
    setCreatingFollowup(null);
    setNotification({ type: "success", msg: `Tarefa de follow-up criada: ${taskTitle}` });
  }

  // ── Delete event ──
  async function handleDelete(eventId: string) {
    if (!confirm("Excluir este evento do Google Calendar?")) return;
    const res = await fetch(`/api/agenda/eventos/${eventId}`, { method: "DELETE" });
    if (res.ok) {
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setNotification({ type: "success", msg: "Evento excluído." });
    } else {
      setNotification({ type: "error", msg: "Erro ao excluir evento." });
    }
  }

  // Auto-dismiss notification
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  return (
    <div className="p-6">
      {/* Notification toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${notification.type === "success" ? "bg-green-600" : "bg-red-500"}`}>
          {notification.type === "success"
            ? <CheckCircle2 className="w-4 h-4"/>
            : <AlertCircle className="w-4 h-4"/>}
          {notification.msg}
          <button onClick={() => setNotification(null)}><X className="w-4 h-4 ml-2 opacity-70"/></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-500 text-sm mt-1">Integrada com Google Calendar</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          {connected === null && (
            <span className="text-xs text-gray-400 px-3 py-1.5 rounded-full bg-gray-100">Verificando...</span>
          )}
          {connected === false && (
            <a href={authUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm bg-blue-600 hover:bg-blue-700 transition-colors">
              <Calendar className="w-4 h-4"/>
              Conectar Google Calendar
            </a>
          )}
          {connected === true && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
              <div className="w-2 h-2 rounded-full bg-green-500"/>
              <span className="text-xs font-semibold text-green-700">Google Calendar</span>
            </div>
          )}
          {connected && (
            <button onClick={loadEvents} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400">
              <RefreshCw className="w-4 h-4"/>
            </button>
          )}
          <button onClick={() => { setShowForm(true); setForm(f => ({ ...f, date: selected ?? new Date().toISOString().slice(0,10) })); }}
            disabled={!connected}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#6366f1" }}>
            <Plus className="w-4 h-4"/> Novo Evento
          </button>
        </div>
      </div>

      {/* Not connected banner */}
      {connected === false && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-4">
          <Calendar className="w-8 h-8 text-blue-500 shrink-0 mt-0.5"/>
          <div>
            <p className="font-semibold text-blue-800">Conecte seu Google Calendar</p>
            <p className="text-sm text-blue-600 mt-1">Visualize, crie e gerencie seus eventos diretamente do Sistema FGT. Clique em "Conectar Google Calendar" acima para autorizar.</p>
          </div>
        </div>
      )}

      <div className="flex gap-5">
        {/* Calendar grid */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button onClick={() => setCurrent(c => c.month===0 ? {month:11,year:c.year-1} : {month:c.month-1,year:c.year})}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
              <ChevronLeft className="w-4 h-4"/>
            </button>
            <h2 className="font-bold text-gray-800">{MONTHS[current.month]} {current.year}</h2>
            <button onClick={() => setCurrent(c => c.month===11 ? {month:0,year:c.year+1} : {month:c.month+1,year:c.year})}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
              <ChevronRight className="w-4 h-4"/>
            </button>
          </div>

          <div className="grid grid-cols-7 px-4 pt-3">
            {DAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 pb-2">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 px-4 pb-4 gap-1">
            {Array.from({length: firstDay}).map((_,i) => <div key={`e${i}`}/>)}
            {Array.from({length: daysInMonth}).map((_,i) => {
              const day = i+1;
              const ds  = dateStr(day);
              const dayEvs = eventsForDay(day);
              return (
                <div key={day} onClick={() => setSelected(selected===ds ? null : ds)}
                  className={`min-h-[72px] p-1 rounded-xl cursor-pointer transition-colors ${isToday(day) ? "ring-2 ring-indigo-400 ring-offset-1" : ""} ${selected===ds ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                  <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? "bg-indigo-500 text-white" : "text-gray-700"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvs.slice(0,3).map(ev => (
                      <div key={ev.id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white truncate font-medium"
                        style={{background: eventColor(ev)}}>
                        {eventTime(ev) ? `${eventTime(ev)} ` : ""}{ev.summary}
                      </div>
                    ))}
                    {dayEvs.length > 3 && <div className="text-[10px] text-gray-400 pl-1">+{dayEvs.length-3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-72 shrink-0 space-y-3">
          {/* Selected day events */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">
              {selected
                ? new Date(selected+"T12:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})
                : "Selecione um dia"}
            </h3>
            {!selected && <p className="text-xs text-gray-400">Clique num dia para ver os eventos</p>}
            {selected && selectedEvents.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum evento neste dia</p>
            )}
            <div className="space-y-2">
              {selectedEvents
                .sort((a,b) => (a.start.dateTime??"").localeCompare(b.start.dateTime??""))
                .map(ev => {
                  const linkedClient = extractClient(ev);
                  const cleanDesc = cleanDescription(ev.description);
                  return (
                  <div key={ev.id} className="group flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{background: eventColor(ev)}}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 leading-snug">{ev.summary}</p>
                      {eventTime(ev) && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <Clock className="w-3 h-3"/> {eventTime(ev)}
                        </div>
                      )}
                      {linkedClient && (
                        <Link href={`/alunos?open=${linkedClient.id}`}
                          className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 mt-1 hover:bg-indigo-100 transition-colors w-fit">
                          <Users className="w-2.5 h-2.5"/>{linkedClient.name}
                        </Link>
                      )}
                      {cleanDesc && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{cleanDesc}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                        <button onClick={() => handleCreateFollowup(ev)}
                          disabled={creatingFollowup === ev.id}
                          className="text-[10px] text-green-600 flex items-center gap-0.5 hover:underline disabled:opacity-50">
                          <ListChecks className="w-3 h-3"/>
                          {creatingFollowup === ev.id ? "Criando..." : "Follow-up"}
                        </button>
                        {ev.htmlLink && (
                          <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-indigo-600 flex items-center gap-0.5 hover:underline">
                            <ExternalLink className="w-3 h-3"/> Google
                          </a>
                        )}
                        <button onClick={() => handleDelete(ev.id)}
                          className="text-[10px] text-red-400 flex items-center gap-0.5 hover:underline ml-auto">
                          <Trash2 className="w-3 h-3"/> Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
            </div>
          </div>

          {/* Upcoming events */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">Próximos eventos</h3>
            {loading ? (
              <p className="text-xs text-gray-400">Carregando...</p>
            ) : (
              <div className="space-y-2">
                {events
                  .filter(e => {
                    const d = new Date(e.start.dateTime ?? e.start.date ?? "");
                    return d >= new Date();
                  })
                  .sort((a,b) => (a.start.dateTime??a.start.date??"").localeCompare(b.start.dateTime??b.start.date??""))
                  .slice(0,5)
                  .map(ev => (
                    <div key={ev.id} className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{background: eventColor(ev)}}/>
                      <div>
                        <p className="text-xs font-medium text-gray-700 leading-snug">{ev.summary}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(ev.start.dateTime??ev.start.date??"").toLocaleDateString("pt-BR",{day:"numeric",month:"short"})}
                          {eventTime(ev) ? ` · ${eventTime(ev)}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                {events.filter(e => new Date(e.start.dateTime??e.start.date??"") >= new Date()).length === 0 && (
                  <p className="text-xs text-gray-400">Nenhum evento futuro</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New event modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Novo Evento</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Título *</label>
                <input required autoFocus value={form.summary} onChange={e => setForm(f=>({...f,summary:e.target.value}))}
                  placeholder="Ex: Consulta com Maria..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Data *</label>
                <input required type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Início</label>
                  <input type="time" value={form.timeStart} onChange={e => setForm(f=>({...f,timeStart:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Fim</label>
                  <input type="time" value={form.timeEnd} onChange={e => setForm(f=>({...f,timeEnd:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
              </div>
              {alunos.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Vincular a aluno/lead</label>
                  <select value={form.clientId} onChange={e => {
                    const opt = alunos.find(a => a.id === e.target.value);
                    setForm(f => ({ ...f, clientId: e.target.value, clientName: opt?.name ?? "" }));
                  }} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 text-gray-700">
                    <option value="">— Nenhum —</option>
                    {alunos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))}
                  placeholder="Notas adicionais..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c.id} type="button" onClick={() => setForm(f=>({...f,colorId:c.id}))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.colorId===c.id ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                      style={{background: c.hex}}/>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{background:"#6366f1"}}>
                  {saving ? "Criando..." : "Criar no Google"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

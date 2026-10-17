"use client";

import { useCallback,useEffect,useRef,useState } from "react";
import { addDays,type AgendaItem,type AgendaTask,type AgendaEvent } from "@/lib/agenda/views";
import { saoPauloDay } from "@/lib/ticktick/mapping";
import { TodayView } from "./components/TodayView";
import { WeekView } from "./components/WeekView";
import { CalendarView } from "./components/CalendarView";
import { MatrixView } from "./components/MatrixView";
import { GooglePanel } from "./components/GooglePanel";
import { SyncBadge,type SyncStatus } from "./components/SyncBadge";
import { TaskForm,requestJson } from "./components/TaskForm";
import { settleSync } from "./components/synchronize";
const tabs=[["hoje","Hoje"],["semana","7 dias"],["calendario","Calendário"],["matriz","Matriz"]] as const;
type Tab=typeof tabs[number][0];
export default function AgendaPage() {
  const [today,setToday]=useState(() => saoPauloDay(new Date()));
  const [tab,setTab]=useState<Tab>("hoje");
  const [items,setItems]=useState<AgendaItem[]>([]);
  const [sync,setSync]=useState<SyncStatus|null>(null);
  const [syncing,setSyncing]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [googleError,setGoogleError]=useState("");
  const [formTask,setFormTask]=useState<AgendaTask|"new"|null>(null);
  const [event,setEvent]=useState<AgendaEvent|null>(null);
  const [range,setRange]=useState({
    from: addDays(today,-35),
    to: addDays(today,70)
  });
  const requestVersion=useRef(0);
  const activeRange=useRef(range);
  useEffect(() => {
    activeRange.current=range;
  },[range]);
  const syncInFlight=useRef<Promise<void>|null>(null);
  const pending=useRef(new Set<string>());
  const load=useCallback(async () => {
    const version=++requestVersion.current;
    setLoading(true);
    try {
      const current=activeRange.current;
      const data=await requestJson(`/api/agenda/items?from=${current.from}&to=${current.to}`);
      if(version!==requestVersion.current) return;
      setItems(data.items.filter((item: AgendaItem) => !pending.current.has(item.id)));
      setSync(data.sync);
      setGoogleError(data.googleError??"");
    } catch(e) {
      if(version===requestVersion.current) setError(e instanceof Error? e.message:"Erro ao carregar agenda.");
    } finally {
      if(version===requestVersion.current) setLoading(false);
    }
  },[]);
  const synchronize=useCallback(() => {
    const previous=syncInFlight.current??Promise.resolve();
    const work=previous.then(async () => {
      setSyncing(true);
      try {
        await settleSync(requestJson);
      } catch {
        setError("Não foi possível finalizar a sincronização. As tarefas locais continuam disponíveis. Tente atualizar em instantes.");
      } finally {
        setSyncing(false);
        await load();
      }
    });
    syncInFlight.current=work;
    void work.finally(() => {
      if(syncInFlight.current===work) syncInFlight.current=null;
    });
    return work;
  },[load]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved=localStorage.getItem("agenda-tab");
        if(tabs.some(([id]) => id===saved)) setTab(saved as Tab);
      } catch { }
      void synchronize();
    });
    const timer=setInterval(() => setToday(saoPauloDay(new Date())),60000);
    return () => clearInterval(timer);
  },[synchronize]);
  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  },[range,load]);
  const onRange=useCallback((from: string,to: string) => setRange(old => old.from===from&&old.to===to? old:{
    from,
    to
  }),[]);
  useEffect(() => {
    if(tab!=="calendario") queueMicrotask(() => onRange(addDays(today,-35),addDays(today,70)));
  },[tab,today,onRange]);
  function changeTab(value: Tab) {
    setTab(value);
    try {
      localStorage.setItem("agenda-tab",value);
    } catch { }
  }
  async function complete(task: AgendaTask) {
    if(pending.current.has(task.id)) return;
    pending.current.add(task.id);
    setItems(old => old.filter(i => !(i.kind==="task"&&i.id===task.id)));
    setError("");
    try {
      await requestJson(`/api/tarefas/${encodeURIComponent(task.id)}`,{
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: "done"
        })
      });
    } catch(e) {
      setItems(old => old.some(i => i.id===task.id)? old:[...old,task]);
      setError(e instanceof Error? e.message:"Não foi possível concluir a tarefa.");
    } finally {
      pending.current.delete(task.id);
      await synchronize();
    }
  }
  const props={
    items,
    today,
    onToggle: complete,
    onOpen: (task: AgendaTask) => setFormTask(task),
    onEvent: (selected: AgendaEvent) => setEvent(selected)
  };
  return <div className="min-w-0 p-3 sm:p-6">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl text-gray-900" style={{
          fontFamily: "var(--font-agenda-serif)"
        }}>
          Agenda
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Seu dia, suas tarefas e compromissos.
        </p>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <SyncBadge sync={sync} syncing={syncing} onSync={synchronize} />
        <button onClick={() => setFormTask("new")} className="rounded-xl bg-[#E91E90] px-4 py-2 text-sm font-semibold text-white">
          + Tarefa
        </button>
        <GooglePanel onChanged={load} selected={event} onCloseEvent={() => setEvent(null)} />
      </div>
    </header>
    <nav aria-label="Visões da agenda" className="mb-5 grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1">
      {tabs.map(([id,label]) => <button key={id} aria-pressed={tab===id} onClick={() => changeTab(id)} className={`min-w-0 rounded-lg px-1 py-3 text-xs sm:text-sm ${tab===id? 'bg-white font-semibold text-[#E91E90] shadow-sm':'text-gray-500'}`}>
        {label}
      </button>)}
    </nav>
    {error&&<div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
      {error}
      <button className="ml-3 underline" onClick={() => {
        setError("");
        void load();
      }}>
        Tentar novamente
      </button>
    </div>}
    {googleError&&<div role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
      {googleError}
      <button onClick={load} className="ml-3 underline">
        Tentar novamente
      </button>
    </div>}
    {loading&&<p role="status" className="mb-3 text-sm text-gray-400">
      Carregando agenda…
    </p>}
    {tab==="hoje"&&<TodayView {...props} />}
    {tab==="semana"&&<WeekView {...props} />}
    {tab==="calendario"&&<CalendarView {...props} onRange={onRange} />}
    {tab==="matriz"&&<MatrixView {...props} />}
    {formTask&&<TaskForm initial={formTask==="new"? undefined:formTask} onClose={() => setFormTask(null)} onSaved={synchronize} />}
  </div>;
}

"use client";

import { useEffect,useState,type FormEvent } from "react";
import { addDays,type AgendaEvent } from "@/lib/agenda/views";
import { saoPauloDay } from "@/lib/ticktick/mapping";
import { googleColors } from "./TaskRow";
import { requestJson } from "./TaskForm";
export function GooglePanel({
  onChanged,
  selected,
  onCloseEvent
}: {
  onChanged: () => void;
  selected: AgendaEvent|null;
  onCloseEvent: () => void;
}) {
  const [connected,setConnected]=useState<boolean|null>(null);
  const [authUrl,setAuthUrl]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [students,setStudents]=useState<{
    id: string;
    name: string;
  }[]>([]);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState<"disconnect"|"delete"|null>(null);
  const [form,setForm]=useState({
    summary: "",
    date: saoPauloDay(new Date()),
    timeStart: "09:00",
    timeEnd: "10:00",
    description: "",
    colorId: "9",
    clientId: ""
  });
  useEffect(() => {
    requestJson("/api/agenda/google").then(data => {
      setConnected(data.connected);
      setAuthUrl(data.authUrl??"");
    }).catch(e => setError(e.message));
    queueMicrotask(() => {
      const params=new URLSearchParams(window.location.search);
      if(params.has("google")) {
        if(params.get("google")==="success") setMessage("Google Calendar conectado com sucesso!"); else setError("Falha ao conectar com o Google Calendar.");
        params.delete("google");
        window.history.replaceState({},"",`${window.location.pathname}${params.size? `?${params}`:""}`);
      }
    });
  },[]);
  async function openForm() {
    setShowForm(true);
    setError("");
    try {
      const data=await requestJson("/api/alunos");
      setStudents(Array.isArray(data)? data.map(({
        id,
        name
      }: {
        id: string;
        name: string;
      }) => ({
        id,
        name
      })):[]);
    } catch {
      setError("Não foi possível carregar os alunos. Tente abrir o formulário novamente.");
    }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch(e) {
      setError(e instanceof Error? e.message:"Erro na operação do Google.");
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if(form.timeEnd<=form.timeStart) throw new Error("O fim deve ser depois do início.");
      const student=students.find(s => s.id===form.clientId);
      const description=`${student? `[FGT:${student.id}:${student.name}]\n`:""}${form.description}`;
      await requestJson("/api/agenda/eventos",{
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary: form.summary.trim(),
          description,
          start: `${form.date}T${form.timeStart}:00-03:00`,
          end: `${form.date}T${form.timeEnd}:00-03:00`,
          colorId: form.colorId
        })
      });
      setShowForm(false);
      setForm(f => ({
        ...f,
        summary: "",
        description: "",
        clientId: ""
      }));
      setMessage("Evento criado no Google Calendar!");
      onChanged();
    });
  }
  function disconnect() {
    void run(async () => {
      await requestJson("/api/agenda/google/disconnect",{
        method: "POST"
      });
      setConnected(false);
      setConfirm(null);
      onCloseEvent();
      onChanged();
      const data=await requestJson("/api/agenda/google");
      setAuthUrl(data.authUrl??"");
      setMessage("Google Calendar desconectado.");
    });
  }
  function remove() {
    if(!selected) return;
    void run(async () => {
      await requestJson(`/api/agenda/eventos/${encodeURIComponent(selected.id)}`,{
        method: "DELETE"
      });
      setConfirm(null);
      onCloseEvent();
      onChanged();
      setMessage("Evento excluído.");
    });
  }
  function followup() {
    if(!selected) return;
    void run(async () => {
      await requestJson("/api/tarefas",{
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: `Follow-up: ${selected.title}`,
          type: selected.client? "student":"general",
          clientId: selected.client?.id??null,
          dueDate: addDays(saoPauloDay(new Date()),1),
          source: "automatic"
        })
      });
      setMessage("Tarefa de follow-up criada.");
      onChanged();
    });
  }
  const field="mt-1 w-full min-w-0 rounded-xl border px-3 py-2 text-sm";
  return <><div className="flex flex-wrap items-center gap-2 text-xs">
    {connected===null? <span>
      Verificando Google…
    </span>:connected? <><span className="text-green-700">
      Google conectado
    </span><button disabled={busy} onClick={() => setConfirm("disconnect")} className="rounded-xl border px-3 py-2">
        Desconectar
      </button><button onClick={onChanged} className="rounded-xl border px-3 py-2">
        Atualizar eventos
      </button></>:authUrl&&<a href={authUrl} className="rounded-xl border px-3 py-2 text-blue-700">
        Conectar Google Calendar
      </a>}
    <button disabled={!connected||busy} onClick={openForm} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40">
      + Evento
    </button>
  </div>
    {message&&<p role="status" className="basis-full text-sm text-green-700">
      {message}
    </p>}
    {error&&<p role="alert" className="basis-full text-sm text-red-600">
      {error}
    </p>}
    {confirm==="disconnect"&&<div className="basis-full rounded-xl bg-red-50 p-3 text-sm">
      Desconectar Google Calendar?
      <button disabled={busy} onClick={disconnect} className="mx-3 text-red-700">
        Confirmar
      </button>
      <button onClick={() => setConfirm(null)}>
        Cancelar
      </button>
    </div>}
    {showForm&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="event-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5">
        <div className="flex justify-between">
          <h2 id="event-title" className="text-xl font-semibold">
            Novo Evento
          </h2>
          <button disabled={busy} aria-label="Fechar evento" onClick={() => setShowForm(false)}>
            ✕
          </button>
        </div>
        <form onSubmit={save} className="mt-4 space-y-4">
          <label className="block text-sm">
            Título
            <input autoFocus required value={form.summary} onChange={e => setForm({
              ...form,
              summary: e.target.value
            })} className={field} />
          </label>
          <label className="block text-sm">
            Data
            <input required type="date" value={form.date} onChange={e => setForm({
              ...form,
              date: e.target.value
            })} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {([['timeStart','Início'],['timeEnd','Fim']] as const).map(([key,label]) => <label key={key} className="min-w-0 text-sm">
              {label}
              <input required type="time" value={form[key]} onChange={e => setForm({
                ...form,
                [key]: e.target.value
              })} className={field} />
            </label>)}
          </div>
          <label className="block text-sm">
            Vincular a aluno/lead
            <select value={form.clientId} onChange={e => setForm({
              ...form,
              clientId: e.target.value
            })} className={field}>
              <option value="">
                Nenhum
              </option>
              {students.map(s => <option key={s.id} value={s.id}>
                {s.name}
              </option>)}
            </select>
          </label>
          <label className="block text-sm">
            Descrição
            <textarea value={form.description} onChange={e => setForm({
              ...form,
              description: e.target.value
            })} className={field} />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm">
              Cor
            </legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(googleColors).map(([id,color]) => <button type="button" key={id} aria-label={`Cor ${id}`} aria-pressed={id===form.colorId} onClick={() => setForm({
                ...form,
                colorId: id
              })} className={`h-7 w-7 rounded-full ${id===form.colorId? 'ring-2 ring-gray-700 ring-offset-2':''}`} style={{
                background: color
              }} />)}
            </div>
          </fieldset>
          {error&&<p role="alert" className="text-sm text-red-600">
            {error}
          </p>}
          <button disabled={busy||!form.summary.trim()} className="rounded-xl bg-[#E91E90] px-4 py-2 text-white disabled:opacity-50">
            {busy? "Criando…":"Criar no Google"}
          </button>
        </form>
      </section>
    </div>}
    {selected&&<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="event-detail-title" className="w-full max-w-md rounded-2xl bg-white p-5">
        <div className="flex justify-between gap-3">
          <h2 id="event-detail-title" className="break-words text-lg font-semibold">
            {selected.title}
          </h2>
          <button aria-label="Fechar detalhes" disabled={busy} onClick={() => {
            onCloseEvent();
            setConfirm(null);
          }}>
            ✕
          </button>
        </div>
        <p className="my-3 text-sm">
          {selected.day}
          {selected.time}
          até
          {selected.endDay}
          {selected.endTime}
        </p>
        <p className="whitespace-pre-wrap text-sm text-gray-500">
          {selected.description}
        </p>
        {selected.client&&<a className="mt-3 block text-pink-700 underline" href={`/alunos?open=${encodeURIComponent(selected.client.id)}`}>
          {selected.client.name}
        </a>}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <button disabled={busy} onClick={followup}>
            Criar follow-up
          </button>
          {selected.htmlLink&&<a href={selected.htmlLink} target="_blank" rel="noopener noreferrer">
            Abrir no Google
          </a>}
          <button disabled={busy} onClick={() => setConfirm("delete")} className="text-red-600">
            Excluir evento
          </button>
        </div>
        {confirm==="delete"&&<div className="mt-4 rounded-xl bg-red-50 p-3 text-sm">
          Excluir este evento?
          <button disabled={busy} onClick={remove} className="mx-3 text-red-700">
            Confirmar
          </button>
          <button onClick={() => setConfirm(null)}>
            Cancelar
          </button>
        </div>}
        {error&&<p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>}
        {message&&<p role="status" className="mt-3 text-sm text-green-700">
          {message}
        </p>}
      </section>
    </div>}
  </>;
}

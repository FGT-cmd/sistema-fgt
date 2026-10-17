"use client";

import { useState,type FormEvent } from "react";
import { matrixFlags,type AgendaTask } from "@/lib/agenda/views";
export async function requestJson(url: string,init?: RequestInit) {
  const response=await fetch(url,init);
  const data=await response.json().catch(() => ({}));
  if(!response.ok) throw new Error("Não foi possível concluir a operação. Tente novamente.");
  return data;
}
export function TaskForm({
  initial,
  onClose,
  onSaved
}: {
  initial?: AgendaTask;
  onClose: () => void;
  onSaved: () => void|Promise<void>;
}) {
  const [title,setTitle]=useState(initial?.title??"");
  const [description,setDescription]=useState(initial?.description??"");
  const [day,setDay]=useState(initial?.day??"");
  const [time,setTime]=useState(initial?.time??"09:00");
  const [allDay,setAllDay]=useState(initial?.allDay??true);
  const [priority,setPriority]=useState<AgendaTask["priority"]>(initial?.priority??"media");
  const [listName,setListName]=useState(initial?.listName??"Work");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const flags=priority===initial?.priority? {
        urgent: initial.urgent??matrixFlags(priority).urgent,
        important: initial.important??matrixFlags(priority).important
      }:matrixFlags(priority);
      await requestJson(initial? `/api/tarefas/${encodeURIComponent(initial.id)}`:"/api/tarefas",{
        method: initial? "PATCH":"POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: title.trim(),
          description,
          allDay,
          priority,
          listName,
          dueDate: day? allDay? day:new Date(`${day}T${time}:00-03:00`).toISOString():null,
          ...flags
        })
      });
      await onSaved();
      onClose();
    } catch(e) {
      setError(e instanceof Error? e.message:"Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/tarefas/${encodeURIComponent(initial!.id)}`,{
        method: "DELETE"
      });
      await onSaved();
      onClose();
    } catch(e) {
      setError(e instanceof Error? e.message:"Erro ao excluir.");
    } finally {
      setBusy(false);
    }
  }
  const field="mt-1 w-full min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-sm";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="task-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="mb-4 flex justify-between">
        <h2 id="task-title" className="text-xl font-semibold">
          {initial? "Editar tarefa":"Nova tarefa"}
        </h2>
        <button aria-label="Fechar" disabled={busy} onClick={onClose}>
          ✕
        </button>
      </div>
      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm">
          Título
          <input autoFocus required value={title} onChange={e => setTitle(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          Descrição
          <textarea value={description} onChange={e => setDescription(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          Data
          <input type="date" required={!allDay} value={day} onChange={e => setDay(e.target.value)} className={field} />
        </label>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
          Dia todo
        </label>
        {!allDay&&<label className="block text-sm">
          Hora
          <input type="time" required value={time} onChange={e => setTime(e.target.value)} className={field} />
        </label>}
        <label className="block text-sm">
          Prioridade
          <select value={priority} onChange={e => setPriority(e.target.value as AgendaTask["priority"])} className={field}>
            {[["alta","Alta"],["media","Média"],["baixa","Baixa"],["nenhuma","Nenhuma"]].map(([v,l]) => <option key={v} value={v}>
              {l}
            </option>)}
          </select>
        </label>
        <label className="block text-sm">
          Lista
          <select value={listName} onChange={e => setListName(e.target.value)} className={field}>
            {["Work","Financeiro","Estudos"].map(l => <option key={l}>
              {l}
            </option>)}
          </select>
        </label>
        {error&&<p role="alert" className="text-sm text-red-600">
          {error}
        </p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={busy||!title.trim()} className="rounded-xl bg-[#E91E90] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy? "Salvando…":"Salvar"}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          {initial&&<button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="ml-auto text-red-600">
            Excluir
          </button>}
        </div>
        {confirmDelete&&<div className="rounded-xl bg-red-50 p-3 text-sm">
          <p>
            Excluir esta tarefa?
          </p>
          <button type="button" disabled={busy} onClick={remove} className="mr-4 py-2 text-red-700">
            Confirmar exclusão
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)}>
            Manter tarefa
          </button>
        </div>}
      </form>
    </section>
  </div>;
}

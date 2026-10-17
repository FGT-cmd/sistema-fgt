"use client";

import { Repeat } from "lucide-react";
import type { AgendaItem,AgendaTask,AgendaEvent } from "@/lib/agenda/views";
export const priorityColors={
  alta: "#E91E90",
  media: "#f59e0b",
  baixa: "#3b82f6",
  nenhuma: "#9ca3af"
};
export const googleColors: Record<string,string>={
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6c026",
  "6": "#f5511d",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d60000"
};
export type ViewProps={
  items: AgendaItem[];
  today: string;
  onToggle: (task: AgendaTask) => void;
  onOpen: (task: AgendaTask) => void;
  onEvent?: (event: AgendaEvent) => void;
};
export function TaskRow({
  item,
  onToggle,
  onOpen,
  onEvent
}: Omit<ViewProps,"items"|"today">&{
  item: AgendaItem;
}) {
  return <div className="flex min-w-0 items-start gap-2 rounded-xl border border-gray-100 bg-white p-3">
    {item.kind==="task"? <button aria-label={`Concluir ${item.title}`} onClick={() => onToggle(item)} className="mt-1 h-5 w-5 shrink-0 rounded-full border-2 hover:bg-pink-50" style={{
      borderColor: priorityColors[item.priority]
    }} />:<span className="mt-1 h-5 w-1 shrink-0 rounded" style={{
      background: googleColors[item.color??"9"]??"#3f51b5"
    }} />}
    <div className="min-w-0 flex-1">
      <button className="w-full break-words text-left text-sm font-semibold hover:text-[#E91E90]" onClick={() => item.kind==="task"? onOpen(item):onEvent?.(item)}>
        {item.title}
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-500">
        {item.day&&<span>
          {item.day.slice(5).split("-").reverse().join("/")}
        </span>}
        <span>
          {item.time? `${item.time}${item.kind==="event"&&item.endTime? ` – ${item.endTime}`:""}`:"dia todo"}
        </span>
        {item.kind==="task"&&<><span className="rounded bg-pink-50 px-1.5 text-pink-800">
          {item.listName??"Work"}
        </span>{item.isRecurring&&<Repeat aria-label="Recorrente" size={13} />}</>}
      </div>
      {item.kind==="event"&&<div className="mt-2 flex flex-wrap gap-3 text-xs">
        {item.client&&<a className="text-pink-700 underline" href={`/alunos?open=${encodeURIComponent(item.client.id)}`}>
          {item.client.name}
        </a>}
        {item.htmlLink&&<a href={item.htmlLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
          Abrir no Google
        </a>}
        <button onClick={() => onEvent?.(item)} className="text-gray-600 underline">
          Detalhes / ações
        </button>
      </div>}
    </div>
  </div>;
}
export function ItemList({
  items,
  ...props
}: Omit<ViewProps,"today">) {
  return <div className="space-y-2">
    {items.length? items.map(item => <TaskRow key={`${item.kind}:${item.id}`} item={item} {...props} />):<p className="p-3 text-sm text-gray-400">
      Nenhum item.
    </p>}
  </div>;
}

"use client";

import { useEffect,useState } from "react";
import { addDays,monthGrid,weekGrid } from "@/lib/agenda/views";
import { ItemList,TaskRow,type ViewProps } from "./TaskRow";
import { dayLabel } from "./WeekView";
export function CalendarView(props: ViewProps&{
  onRange: (from: string,to: string) => void;
}) {
  const [mode,setMode]=useState<"month"|"week">("month");
  const [anchor,setAnchor]=useState(props.today);
  const [selected,setSelected]=useState(props.today);
  const year=Number(anchor.slice(0,4)),
    month=Number(anchor.slice(5,7));
  const monthDays=monthGrid(props.items,year,month);
  const weekStart=addDays(anchor,-new Date(`${anchor}T12:00:00Z`).getUTCDay());
  const days=weekGrid(props.items,weekStart);
  const from=mode==="month"? monthDays[0].day:weekStart;
  const to=mode==="month"? monthDays[41].day:addDays(weekStart,6);
  const {
    onRange
  }=props;
  useEffect(() => {
    onRange(from,to);
  },[from,to,onRange]);
  function navigate(direction: number) {
    if(mode==="week") {
      setAnchor(addDays(anchor,direction*7));
      return;
    }
    const date=new Date(`${anchor.slice(0,7)}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth()+direction);
    setAnchor(date.toISOString().slice(0,10));
  }
  const selectedItems=monthDays.find(d => d.day===selected)?.items??[];
  return <section className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {([['month','Mês'],['week','Semana']] as const).map(([value,label]) => <button key={value} aria-pressed={mode===value} onClick={() => setMode(value)} className={`rounded-lg px-3 py-2 text-sm ${mode===value? 'bg-white text-pink-700 shadow-sm':''}`}>
          {label}
        </button>)}
      </div>
      <div className="flex items-center gap-2">
        <button aria-label="Período anterior" onClick={() => navigate(-1)} className="rounded-lg border px-3 py-2">
          ‹
        </button>
        <h2 className="text-sm font-semibold">
          {mode==="month"? new Date(`${anchor}T12:00:00Z`).toLocaleDateString("pt-BR",{
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
          }):`${dayLabel(from)} – ${dayLabel(to)}`}
        </h2>
        <button aria-label="Próximo período" onClick={() => navigate(1)} className="rounded-lg border px-3 py-2">
          ›
        </button>
        <button onClick={() => {
          setAnchor(props.today);
          setSelected(props.today);
        }} className="text-sm text-pink-700">
          Hoje
        </button>
      </div>
    </div>
    {mode==="month"? <><div className="grid grid-cols-7 overflow-hidden rounded-xl border">
      {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => <div key={d} className="bg-gray-50 py-2 text-center text-xs text-gray-500">
        {d}
      </div>)}
      {monthDays.map(d => <button key={d.day} onClick={() => setSelected(d.day)} aria-label={dayLabel(d.day)} aria-pressed={selected===d.day} className={`min-h-24 min-w-0 border-t border-r p-1 text-left sm:p-2 ${selected===d.day? 'bg-pink-50':'bg-white'} ${d.inMonth? '':'text-gray-400'}`}>
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d.day===props.today? 'bg-[#E91E90] text-white':''}`}>
          {Number(d.day.slice(8))}
        </span>
        <div className="mt-1 space-y-1">
          {d.items.slice(0,3).map(i => <div key={`${i.kind}:${i.id}`} className="truncate rounded bg-gray-100 px-1 text-[10px] text-gray-700" title={i.title}>
            {i.title}
          </div>)}
          {d.items.length>3&&<div className="text-[10px] text-pink-700">
            +
            {d.items.length-3}
          </div>}
        </div>
      </button>)}
    </div><h3 className="font-semibold">
        {dayLabel(selected)}
      </h3><ItemList {...props} items={selectedItems} /></>:<div className="max-w-full overflow-x-auto rounded-xl border" tabIndex={0} aria-label="Grade semanal por hora. Role horizontalmente para ver todos os dias.">
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-gray-50">
          <span className="p-2 text-xs">
            Dia todo
          </span>
          {days.map(d => <div key={d.day} className="min-w-0 border-l p-2">
            <h3 className="mb-2 text-xs font-semibold">
              {dayLabel(d.day)}
            </h3>
            <ItemList {...props} items={d.allDay} />
          </div>)}
        </div>
        {Array.from({
          length: 24
        },(_,hour) => <div key={hour} className="grid min-h-20 grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b">
          <span className="p-2 text-xs text-gray-400">
            {String(hour).padStart(2,'0')}
            :00
          </span>
          {days.map(d => <div key={d.day} className="min-w-0 space-y-1 border-l p-1">
            {d.timed.filter(i => Number(i.time!.slice(0,2))===hour).map(i => <TaskRow key={`${i.kind}:${i.id}`} item={i} onToggle={props.onToggle} onOpen={props.onOpen} onEvent={props.onEvent} />)}
          </div>)}
        </div>)}
      </div>
    </div>}
  </section>;
}

"use client";

import { useEffect,useState } from "react";
export type SyncStatus={
  lastOkAt?: string|null;
  lastError?: string|null;
  authBroken?: boolean;
  enabled?: boolean;
  runningSince?: string|null;
};
export function SyncBadge({
  sync,
  syncing,
  onSync
}: {
  sync: SyncStatus|null;
  syncing: boolean;
  onSync: () => void;
}) {
  const [now,setNow]=useState(() => Date.now());
  useEffect(() => {
    const timer=setInterval(() => setNow(Date.now()),60000);
    return () => clearInterval(timer);
  },[]);
  const disabled=sync?.enabled===false;
  const minutes=sync?.lastOkAt? Math.max(0,Math.floor((now-Date.parse(sync.lastOkAt))/60000)):null;
  const recurrenceConflict=sync?.lastError?.startsWith("Conflito de recorrência:");
  const label=disabled? "Sincronização aguardando ativação":syncing? "Sincronizando…":sync?.authBroken? "Reconectar TickTick":recurrenceConflict? "Revisar recorrência":sync?.lastError? "Erro ao sincronizar":minutes!==null? `TickTick sincronizado há ${minutes} min`:"Sincronizar TickTick";
  const title=sync?.authBroken? "Rodar ticktick-auth-setup.js na ponte do Jarvis e atualizar TICKTICK_ACCESS_TOKEN na Vercel.":recurrenceConflict? (sync?.lastError??undefined):sync?.lastError? "Falha na sincronização. Tente novamente ou revise a configuração.":undefined;
  return <div className="flex flex-col items-start gap-1"><button disabled={syncing||disabled} onClick={onSync} title={title} className={`rounded-full border px-3 py-2 text-left text-xs disabled:cursor-default ${!disabled&&(sync?.authBroken||sync?.lastError)? "border-red-200 text-red-600":"border-gray-200 text-gray-500"}`}>
    {label}
  </button>
    {recurrenceConflict&&<p role="status" className="max-w-md text-xs text-amber-700">{sync?.lastError}</p>}
  </div>;
}

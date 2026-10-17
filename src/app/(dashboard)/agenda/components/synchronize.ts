// Serialize writes and refresh after any server-side background synchronization.
export type SyncResult={
  skipped?: string;
  enabled?: boolean;
  error?: string;
};
export async function settleSync(request: (url: string,init?: RequestInit) => Promise<SyncResult&{
  running?: boolean;
  runningSince?: string|null;
}>,pause: () => Promise<void>=() => new Promise(resolve => setTimeout(resolve,500))) {
  for(let attempt=0;attempt<20;attempt++) {
    const result=await request("/api/agenda/sync",{
      method: "POST"
    });
    if(result.skipped!=="running") return;
    await pause();
    await request("/api/agenda/sync");
  }
  throw new Error("A sincronização ainda está em andamento. Atualize a agenda em instantes.");
}

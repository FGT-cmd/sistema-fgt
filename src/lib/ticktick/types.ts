// Tipos da integração com o TickTick (Open API v1).

export const SYNCED_LISTS = ["Work", "Financeiro", "Estudos"] as const;
export type ListName = (typeof SYNCED_LISTS)[number];

export type Priority = "alta" | "media" | "baixa" | "nenhuma";

/** Tarefa do TickTick já normalizada para o domínio. */
export type RemoteTask = {
  id: string;
  projectId: string;
  listName: ListName;
  title: string;
  content: string;
  dueDate: string | null;   // ISO UTC (o executor converte do formato do TickTick)
  isAllDay: boolean;
  priority: 0 | 1 | 3 | 5;
  modifiedTime: string | null; // ISO UTC
  isRecurring: boolean;
  etag: string | null;
};

/** Formato cru devolvido pela API (só os campos usados). */
export type TickTickApiTask = {
  id: string;
  projectId: string;
  title?: string;
  content?: string;
  desc?: string;
  dueDate?: string;
  startDate?: string;
  isAllDay?: boolean;
  priority?: number;
  status?: number;
  modifiedTime?: string;
  repeatFlag?: string;
  etag?: string;
};

export type TickTickApiProject = { id: string; name: string; closed?: boolean | null };

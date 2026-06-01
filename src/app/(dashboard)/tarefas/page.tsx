"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Plus, ChevronDown, ChevronRight, Trash2, Loader2, Calendar, User,
  Tag, MoreHorizontal, Check, Circle, Pencil, X, AlertCircle, Clock,
  ArrowRight, ExternalLink, Timer, Zap,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

type TodoTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "pending" | "in_progress" | "waiting" | "done" | "cancelled";
  priority: "alta" | "media" | "baixa";
  type: string;
  source: string;
  urgent: boolean | null;
  important: boolean | null;
  client: { id: string; name: string } | null;
  subtasks: Subtask[];
  completedAt: string | null;
};

type TabKey = "today" | "overdue" | "week" | "waiting" | "backlog" | "done";

type Filters = { type: string; priority: string; clientId: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPES = [
  { id: "general",        label: "Geral" },
  { id: "student",        label: "Alunos" },
  { id: "financial",      label: "Financeiro" },
  { id: "content",        label: "Conteúdo" },
  { id: "commercial",     label: "Comercial" },
  { id: "administrative", label: "Administrativo" },
  { id: "operational",    label: "Operacional" },
  { id: "fiscal",         label: "Fiscal" },
  { id: "agenda",         label: "Agenda" },
  { id: "project",        label: "Projetos" },
];

const TYPE_COLORS: Record<string, string> = {
  general:        "#6366f1",
  student:        "#10b981",
  financial:      "#f59e0b",
  content:        "#3b82f6",
  commercial:     "#ec4899",
  administrative: "#8b5cf6",
  operational:    "#14b8a6",
  fiscal:         "#7c3aed",
  agenda:         "#0ea5e9",
  project:        "#6366f1",
};

const TYPE_BG: Record<string, string> = {
  general:        "#eef2ff",
  student:        "#f0fdf4",
  financial:      "#fffbeb",
  content:        "#eff6ff",
  commercial:     "#fdf2f8",
  administrative: "#f5f3ff",
  operational:    "#f0fdfa",
  fiscal:         "#f5f3ff",
  agenda:         "#f0f9ff",
  project:        "#eef2ff",
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  alta:  { label: "Alta",  color: "#ef4444", bg: "#fef2f2" },
  media: { label: "Média", color: "#f59e0b", bg: "#fffbeb" },
  baixa: { label: "Baixa", color: "#94a3b8", bg: "#f8fafc" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual:    "Manual",
  whatsapp:  "WhatsApp",
  automatic: "OpenClaw",
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "today",   label: "Hoje" },
  { key: "overdue", label: "Atrasadas" },
  { key: "week",    label: "Semana" },
  { key: "waiting", label: "Aguardando" },
  { key: "backlog", label: "Backlog" },
  { key: "done",    label: "Concluídas" },
];

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

const KANBAN_COLS = [
  { id: "pending",     label: "A Fazer",      color: "#6366f1", bg: "#eef2ff" },
  { id: "in_progress", label: "Em Andamento", color: "#f59e0b", bg: "#fffbeb" },
  { id: "done",        label: "Concluída",    color: "#10b981", bg: "#f0fdf4" },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getTodayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function getDayEnd(d: Date) {
  const e = new Date(d); e.setHours(23, 59, 59, 999); return e;
}
function dateOnly(iso: string) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0); return d;
}
function addDays(date: string | null, days: number): string {
  const d = date ? new Date(date) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ─── Tab filtering ────────────────────────────────────────────────────────────

function getTabTasks(tab: TabKey, tasks: TodoTask[]): TodoTask[] {
  const todayStart = getTodayStart();
  const todayEnd   = getDayEnd(todayStart);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(todayEnd); weekEnd.setDate(weekEnd.getDate() + 7);

  switch (tab) {
    case "today":
      return tasks.filter(t =>
        !["done","cancelled"].includes(t.status) &&
        t.dueDate && dateOnly(t.dueDate) >= todayStart && dateOnly(t.dueDate) <= todayEnd,
      );
    case "overdue":
      return tasks.filter(t =>
        !["done","cancelled"].includes(t.status) &&
        t.dueDate && dateOnly(t.dueDate) < todayStart,
      );
    case "week":
      return tasks.filter(t =>
        !["done","cancelled"].includes(t.status) &&
        t.dueDate && dateOnly(t.dueDate) >= tomorrowStart && dateOnly(t.dueDate) <= weekEnd,
      );
    case "waiting":
      return tasks.filter(t => t.status === "waiting");
    case "backlog":
      return tasks.filter(t =>
        !["done","cancelled","waiting"].includes(t.status) &&
        (!t.dueDate || dateOnly(t.dueDate) > weekEnd),
      );
    case "done":
      return tasks.filter(t => t.status === "done");
    default:
      return [];
  }
}

function sortTasks(tasks: TodoTask[]): TodoTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

// ─── SubtaskRow ───────────────────────────────────────────────────────────────

function SubtaskRow({ sub, taskId, onToggle, onDelete }: {
  sub: Subtask;
  taskId: string;
  onToggle: (subId: string, completed: boolean) => void;
  onDelete: (subId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1 group/sub pl-1">
      <button
        onClick={() => onToggle(sub.id, !sub.completed)}
        className="flex-shrink-0 text-gray-300 hover:text-indigo-500 transition-colors"
      >
        {sub.completed
          ? <Check className="w-3.5 h-3.5 text-indigo-500" />
          : <Circle className="w-3.5 h-3.5" />
        }
      </button>
      <span className={`text-sm flex-1 ${sub.completed ? "line-through text-gray-300" : "text-gray-600"}`}>
        {sub.title}
      </span>
      <button
        onClick={() => onDelete(sub.id)}
        className="opacity-0 group-hover/sub:opacity-100 text-gray-300 hover:text-red-400 transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, onComplete, onDelete, onUpdate, onDelay, onSetWaiting, onCancel,
  onAddSubtask, onToggleSubtask, onDeleteSubtask,
}: {
  task: TodoTask;
  onComplete:      (id: string) => void;
  onDelete:        (id: string) => void;
  onUpdate:        (id: string, data: Record<string, unknown>) => void;
  onDelay:         (id: string, days: number) => void;
  onSetWaiting:    (id: string) => void;
  onCancel:        (id: string) => void;
  onAddSubtask:    (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string, completed: boolean) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menu,     setMenu]     = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [subInput, setSubInput] = useState("");
  const [editForm, setEditForm] = useState({
    title:       task.title,
    description: task.description ?? "",
    dueDate:     task.dueDate ? task.dueDate.split("T")[0] : "",
    type:        task.type,
    priority:    task.priority,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef  = useRef<HTMLInputElement>(null);

  const typeLabel = TYPES.find(t => t.id === task.type)?.label ?? task.type;
  const typeColor = TYPE_COLORS[task.type] ?? "#6366f1";
  const typeBg    = TYPE_BG[task.type]    ?? "#eef2ff";
  const priority  = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media;
  const isOverdue = task.dueDate ? dateOnly(task.dueDate) < getTodayStart() : false;
  const isDone    = task.status === "done";
  const doneCount = task.subtasks.filter(s => s.completed).length;

  useEffect(() => {
    if (!menu) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menu]);

  function handleSubAdd(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !subInput.trim()) return;
    onAddSubtask(task.id, subInput.trim());
    setSubInput("");
    setTimeout(() => subRef.current?.focus(), 50);
  }

  function openEdit() {
    setEditForm({
      title:       task.title,
      description: task.description ?? "",
      dueDate:     task.dueDate ? task.dueDate.split("T")[0] : "",
      type:        task.type,
      priority:    task.priority,
    });
    setEditing(true);
    setMenu(false);
  }

  function handleEditSave() {
    onUpdate(task.id, {
      title:       editForm.title.trim() || task.title,
      description: editForm.description || null,
      dueDate:     editForm.dueDate || null,
      type:        editForm.type,
      priority:    editForm.priority,
    });
    setEditing(false);
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  return (
    <>
      <div className={`group/card bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all mb-2 ${isDone ? "opacity-60" : ""}`}>
        <div
          className="flex items-start gap-3 px-4 py-3 cursor-pointer"
          onClick={() => setExpanded(v => !v)}
        >
          {/* Checkbox */}
          <button
            onClick={e => { e.stopPropagation(); if (!isDone) onComplete(task.id); }}
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              isDone ? "border-emerald-500 bg-emerald-500" : "border-gray-300 hover:border-indigo-500"
            }`}
          >
            {isDone && <Check className="w-3 h-3 text-white" />}
            {!isDone && <div className="w-2 h-2 rounded-full opacity-0 group-hover/card:opacity-30 bg-indigo-500 transition-opacity" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title + priority dot */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}>
                {task.title}
              </span>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: priority.color }}
                title={`Prioridade ${priority.label}`}
              />
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: typeColor, background: typeBg }}
              >
                {typeLabel}
              </span>

              {task.dueDate && (
                <span className={`text-xs flex items-center gap-1 ${
                  isOverdue && !isDone ? "text-red-500 font-medium" : "text-gray-400"
                }`}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(task.dueDate)}
                  {isOverdue && !isDone && " · atrasada"}
                </span>
              )}

              {task.client && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {task.client.name}
                </span>
              )}

              {task.subtasks.length > 0 && (
                <span className={`text-xs flex items-center gap-1 ${
                  doneCount === task.subtasks.length ? "text-emerald-500" : "text-gray-400"
                }`}>
                  <Tag className="w-3 h-3" />
                  {doneCount}/{task.subtasks.length}
                </span>
              )}

              {task.source !== "manual" && (
                <span className="text-xs text-indigo-400 font-medium">
                  {SOURCE_LABELS[task.source] ?? task.source}
                </span>
              )}

              {task.status === "waiting" && (
                <span className="text-xs text-amber-500 font-medium flex items-center gap-1">
                  <Timer className="w-3 h-3" /> Aguardando
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu(v => !v)}
                className="opacity-0 group-hover/card:opacity-100 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {menu && (
                <div className="absolute right-0 top-8 bg-white border border-gray-100 rounded-xl shadow-lg z-30 py-1 w-44">
                  {!isDone && (
                    <>
                      <button
                        onClick={() => { setMenu(false); onComplete(task.id); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-500" /> Concluir
                      </button>
                      <button
                        onClick={() => { setMenu(false); onDelay(task.id, 1); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-blue-400" /> Adiar 1 dia
                      </button>
                      <button
                        onClick={() => { setMenu(false); onDelay(task.id, 7); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-blue-300" /> Adiar 7 dias
                      </button>
                      <button
                        onClick={() => { setMenu(false); onSetWaiting(task.id); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Timer className="w-3.5 h-3.5 text-amber-400" /> Aguardando
                      </button>
                      <div className="my-1 border-t border-gray-50" />
                    </>
                  )}
                  <button
                    onClick={openEdit}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="w-3.5 h-3.5 text-indigo-400" /> Editar
                  </button>
                  {task.client && (
                    <a
                      href={`/alunos/${task.client.id}`}
                      onClick={() => setMenu(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-teal-400" /> Abrir aluno
                    </a>
                  )}
                  <div className="my-1 border-t border-gray-50" />
                  {!isDone && (
                    <button
                      onClick={() => { setMenu(false); onCancel(task.id); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-600 hover:bg-amber-50"
                    >
                      <X className="w-3.5 h-3.5" /> Cancelar tarefa
                    </button>
                  )}
                  <button
                    onClick={() => { setMenu(false); onDelete(task.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expanded: description + subtasks */}
        {expanded && (
          <div className="mx-4 mb-3 pl-8 border-t border-gray-50 pt-3 space-y-3">
            {task.description && (
              <p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
            )}
            <div className="space-y-0.5">
              {task.subtasks.map(sub => (
                <SubtaskRow
                  key={sub.id}
                  sub={sub}
                  taskId={task.id}
                  onToggle={(subId, completed) => onToggleSubtask(task.id, subId, completed)}
                  onDelete={subId => onDeleteSubtask(task.id, subId)}
                />
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Plus className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <input
                  ref={subRef}
                  value={subInput}
                  onChange={e => setSubInput(e.target.value)}
                  onKeyDown={handleSubAdd}
                  placeholder="Adicionar subtarefa... (Enter)"
                  className="text-sm text-gray-500 placeholder-gray-300 bg-transparent outline-none flex-1"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setEditing(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Editar tarefa</h2>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Título *"
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                className={inputCls}
                autoFocus
              />
              <textarea
                placeholder="Descrição (opcional)"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Data</label>
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Prioridade</label>
                  <select
                    value={editForm.priority}
                    onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as "alta" | "media" | "baixa" }))}
                    className={inputCls}
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Área</label>
                <select
                  value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                  className={inputCls}
                >
                  {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editForm.title.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#6366f1" }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── KanbanCard ───────────────────────────────────────────────────────────────

function KanbanCard({ task, onDragStart, onClick }: {
  task: TodoTask;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const doneCount = task.subtasks.filter(s => s.completed).length;
  const dragged = useRef(false);
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media;

  return (
    <div
      draggable
      onDragStart={() => { dragged.current = true; onDragStart(); }}
      onDragEnd={() => setTimeout(() => { dragged.current = false; }, 50)}
      onClick={() => { if (!dragged.current) onClick(); }}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
          style={{ background: priority.color }}
          title={`Prioridade ${priority.label}`}
        />
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ color: TYPE_COLORS[task.type] ?? "#6366f1", background: TYPE_BG[task.type] ?? "#eef2ff" }}
        >
          {TYPES.find(t => t.id === task.type)?.label ?? task.type}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {task.dueDate && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" />{formatDate(task.dueDate)}
          </span>
        )}
        {task.client && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <User className="w-3 h-3" />{task.client.name}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="text-xs flex items-center gap-1" style={{ color: doneCount === task.subtasks.length ? "#10b981" : "#94a3b8" }}>
            <Check className="w-3 h-3" />{doneCount}/{task.subtasks.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── KanbanDetailPanel ────────────────────────────────────────────────────────

function KanbanDetailPanel({ task, onClose, onAddSubtask, onToggleSubtask, onDeleteSubtask, onStatusChange }: {
  task: TodoTask;
  onClose: () => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string, completed: boolean) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [subInput, setSubInput] = useState("");
  const subRef = useRef<HTMLInputElement>(null);
  const doneCount = task.subtasks.filter(s => s.completed).length;

  const allStatuses = [
    { id: "pending",     label: "A Fazer",      color: "#6366f1" },
    { id: "in_progress", label: "Em Andamento", color: "#f59e0b" },
    { id: "waiting",     label: "Aguardando",   color: "#f97316" },
    { id: "done",        label: "Concluída",    color: "#10b981" },
    { id: "cancelled",   label: "Cancelada",    color: "#94a3b8" },
  ];

  function handleSubAdd(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !subInput.trim()) return;
    onAddSubtask(task.id, subInput.trim());
    setSubInput("");
    setTimeout(() => subRef.current?.focus(), 50);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-snug">{task.title}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: TYPE_COLORS[task.type] ?? "#6366f1", background: TYPE_BG[task.type] ?? "#eef2ff" }}
              >
                {TYPES.find(t => t.id === task.type)?.label ?? task.type}
              </span>
              {task.dueDate && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />{formatDate(task.dueDate)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-50 flex gap-1.5 flex-wrap">
          {allStatuses.map(s => (
            <button
              key={s.id}
              onClick={() => onStatusChange(task.id, s.id)}
              className="flex items-center px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={task.status === s.id
                ? { background: s.color, color: "#fff" }
                : { background: "#f1f5f9", color: "#6b7280" }
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {task.description && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Descrição</p>
              <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Subtarefas</p>
              {task.subtasks.length > 0 && (
                <span className="text-xs text-gray-400">{doneCount}/{task.subtasks.length} concluídas</span>
              )}
            </div>

            {task.subtasks.length > 0 && (
              <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(doneCount / task.subtasks.length) * 100}%`,
                    background: doneCount === task.subtasks.length ? "#10b981" : "#6366f1",
                  }}
                />
              </div>
            )}

            <div className="space-y-1">
              {task.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 py-2 group/sub px-2 rounded-lg hover:bg-gray-50">
                  <button
                    onClick={() => onToggleSubtask(task.id, sub.id, !sub.completed)}
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      sub.completed ? "border-indigo-500 bg-indigo-500" : "border-gray-300 hover:border-indigo-400"
                    }`}
                  >
                    {sub.completed && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className={`text-sm flex-1 ${sub.completed ? "line-through text-gray-300" : "text-gray-700"}`}>
                    {sub.title}
                  </span>
                  <button
                    onClick={() => onDeleteSubtask(task.id, sub.id)}
                    className="opacity-0 group-hover/sub:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-2 px-2 py-2 rounded-lg border border-dashed border-gray-200 hover:border-indigo-300 transition-colors">
              <Plus className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <input
                ref={subRef}
                value={subInput}
                onChange={e => setSubInput(e.target.value)}
                onKeyDown={handleSubAdd}
                placeholder="Nova subtarefa… (Enter)"
                className="text-sm text-gray-600 placeholder-gray-300 bg-transparent outline-none flex-1"
              />
            </div>
          </div>

          {task.client && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Aluno</p>
              <a
                href={`/alunos/${task.client.id}`}
                className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
              >
                {task.client.name} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── KanbanView ───────────────────────────────────────────────────────────────

function KanbanView({ tasks, onStatusChange, onAdd, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  tasks: TodoTask[];
  onStatusChange:  (id: string, status: string) => void;
  onAdd:           () => void;
  onAddSubtask:    (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string, completed: boolean) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
}) {
  const [dragging,     setDragging]     = useState<string | null>(null);
  const [dragOver,     setDragOver]     = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TodoTask | null>(null);

  const currentSelected = selectedTask ? tasks.find(t => t.id === selectedTask.id) ?? null : null;

  function handleDrop(colId: string) {
    if (!dragging) return;
    const task = tasks.find(t => t.id === dragging);
    if (task && task.status !== colId) onStatusChange(dragging, colId);
    setDragging(null);
    setDragOver(null);
  }

  return (
    <div className="flex gap-4 flex-1 overflow-x-auto pb-4">
      {KANBAN_COLS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id);
        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-72 flex flex-col rounded-2xl transition-colors"
            style={{ background: dragOver === col.id ? col.bg : "#f1f5f9" }}
            onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(col.id)}
          >
            <div className="px-3 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                  <span className="text-xs bg-white rounded-full px-1.5 py-0.5 text-gray-400 font-medium">
                    {colTasks.length}
                  </span>
                </div>
                <button onClick={onAdd} className="text-gray-400 hover:text-indigo-500 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
              {colTasks.length === 0 && (
                <div className="text-center py-8 text-gray-300 text-xs border-2 border-dashed border-gray-200 rounded-xl">
                  Solte aqui
                </div>
              )}
              {colTasks.map(task => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onDragStart={() => setDragging(task.id)}
                  onClick={() => setSelectedTask(task)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {currentSelected && (
        <KanbanDetailPanel
          task={currentSelected}
          onClose={() => setSelectedTask(null)}
          onAddSubtask={onAddSubtask}
          onToggleSubtask={onToggleSubtask}
          onDeleteSubtask={onDeleteSubtask}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  );
}

// ─── Main TarefasPage ─────────────────────────────────────────────────────────

const TAB_EMPTY: Record<TabKey, string> = {
  today:   "Nenhuma tarefa para hoje.",
  overdue: "Nenhuma tarefa atrasada.",
  week:    "Nenhuma tarefa para a semana.",
  waiting: "Nenhuma tarefa aguardando.",
  backlog: "Backlog limpo.",
  done:    "Nenhuma tarefa concluída.",
};

export default function TarefasPage() {
  const [tasks,        setTasks]        = useState<TodoTask[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<TabKey>("today");
  const [view,         setView]         = useState<"operational" | "kanban">("operational");
  const [filters,      setFilters]      = useState<Filters>({ type: "", priority: "", clientId: "" });
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [addForm,      setAddForm]      = useState({
    title: "", description: "", dueDate: "", type: "general", priority: "media", source: "manual",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tarefas?status=all");
    const data = await res.json();
    setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Summary counts ─────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const todayStart = getTodayStart();
    const todayEnd   = getDayEnd(todayStart);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekEnd = new Date(todayEnd); weekEnd.setDate(weekEnd.getDate() + 7);
    return {
      overdue:      tasks.filter(t => !["done","cancelled"].includes(t.status) && t.dueDate && dateOnly(t.dueDate) < todayStart).length,
      today:        tasks.filter(t => !["done","cancelled"].includes(t.status) && t.dueDate && dateOnly(t.dueDate) >= todayStart && dateOnly(t.dueDate) <= todayEnd).length,
      week:         tasks.filter(t => !["done","cancelled"].includes(t.status) && t.dueDate && dateOnly(t.dueDate) >= tomorrowStart && dateOnly(t.dueDate) <= weekEnd).length,
      highPriority: tasks.filter(t => !["done","cancelled"].includes(t.status) && t.priority === "alta").length,
      waiting:      tasks.filter(t => t.status === "waiting").length,
      doneToday:    tasks.filter(t => t.status === "done" && t.completedAt && dateOnly(t.completedAt) >= todayStart).length,
    };
  }, [tasks]);

  // ── Displayed tasks ────────────────────────────────────────────────────────

  const displayedTasks = useMemo(() => {
    let list = getTabTasks(activeTab, tasks);
    if (filters.type)     list = list.filter(t => t.type === filters.type);
    if (filters.priority) list = list.filter(t => t.priority === filters.priority);
    if (filters.clientId) list = list.filter(t => t.client?.id === filters.clientId);
    return sortTasks(list);
  }, [tasks, activeTab, filters]);

  // ── Client options ─────────────────────────────────────────────────────────

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (t.client) map.set(t.client.id, t.client.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleComplete(id: string) {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "done" as const, completedAt: now } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  }

  async function handleDelay(id: string, days: number) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newDate = addDays(task.dueDate, days);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, dueDate: newDate } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: newDate }),
    });
  }

  async function handleSetWaiting(id: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "waiting" as const, completedAt: null } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waiting" }),
    });
  }

  async function handleCancel(id: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "cancelled" as const, completedAt: null } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
  }

  async function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/tarefas/${id}`, { method: "DELETE" });
  }

  async function handleUpdate(id: string, data: Record<string, unknown>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function handleStatusChange(id: string, status: string) {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t,
      status: status as TodoTask["status"],
      completedAt: status === "done" ? now : null,
    } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function handleAddSubtask(taskId: string, title: string) {
    const res = await fetch(`/api/tarefas/${taskId}/subtarefas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const sub = await res.json();
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: [...t.subtasks, sub] } : t));
  }

  async function handleToggleSubtask(taskId: string, subId: string, completed: boolean) {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, subtasks: t.subtasks.map(s => s.id === subId ? { ...s, completed } : s) } : t,
    ));
    await fetch(`/api/tarefas/${taskId}/subtarefas/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
  }

  async function handleDeleteSubtask(taskId: string, subId: string) {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subId) } : t,
    ));
    await fetch(`/api/tarefas/${taskId}/subtarefas/${subId}`, { method: "DELETE" });
  }

  async function handleAddTask() {
    if (!addForm.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:       addForm.title.trim(),
        description: addForm.description || null,
        dueDate:     addForm.dueDate || null,
        type:        addForm.type,
        priority:    addForm.priority,
        source:      addForm.source,
      }),
    });
    const task = await res.json();
    setTasks(prev => [...prev, task]);
    setAddForm({ title: "", description: "", dueDate: "", type: "general", priority: "media", source: "manual" });
    setShowAddModal(false);
    setSaving(false);
  }

  // ── Summary card configs ───────────────────────────────────────────────────

  const summaryCards = [
    {
      label: "Atrasadas",
      count: counts.overdue,
      color: counts.overdue > 0 ? "#ef4444" : "#94a3b8",
      bg:    counts.overdue > 0 ? "#fef2f2" : "#f8fafc",
      Icon:  AlertCircle,
      action: () => setActiveTab("overdue"),
    },
    {
      label: "Hoje",
      count: counts.today,
      color: "#6366f1",
      bg:    "#eef2ff",
      Icon:  Clock,
      action: () => setActiveTab("today"),
    },
    {
      label: "Semana",
      count: counts.week,
      color: "#3b82f6",
      bg:    "#eff6ff",
      Icon:  Calendar,
      action: () => setActiveTab("week"),
    },
    {
      label: "Alta prioridade",
      count: counts.highPriority,
      color: counts.highPriority > 0 ? "#ef4444" : "#94a3b8",
      bg:    counts.highPriority > 0 ? "#fef2f2" : "#f8fafc",
      Icon:  Zap,
      action: () => setFilters(f => ({ ...f, priority: f.priority === "alta" ? "" : "alta" })),
    },
    {
      label: "Aguardando",
      count: counts.waiting,
      color: "#f59e0b",
      bg:    "#fffbeb",
      Icon:  Timer,
      action: () => setActiveTab("waiting"),
    },
    {
      label: "Concluídas hoje",
      count: counts.doneToday,
      color: "#10b981",
      bg:    "#f0fdf4",
      Icon:  Check,
      action: () => setActiveTab("done"),
    },
  ];

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";
  const hasFilters = filters.type || filters.priority || filters.clientId;

  return (
    <div className={`p-6 h-full flex flex-col ${view === "kanban" ? "" : "max-w-4xl mx-auto"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central de Tarefas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(v => v === "operational" ? "kanban" : "operational")}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {view === "operational" ? "Kanban" : "Lista"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#6366f1" }}
          >
            <Plus className="w-4 h-4" />
            Nova tarefa
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      ) : view === "kanban" ? (
        <KanbanView
          tasks={tasks}
          onStatusChange={handleStatusChange}
          onAdd={() => setShowAddModal(true)}
          onAddSubtask={handleAddSubtask}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            {summaryCards.map((card, i) => (
              <button
                key={i}
                onClick={card.action}
                className="rounded-xl p-3 text-left transition-all hover:scale-105 active:scale-95 border"
                style={{ background: card.bg, borderColor: card.color + "33" }}
              >
                <card.Icon className="w-4 h-4 mb-1" style={{ color: card.color }} />
                <p className="text-xl font-bold leading-none mb-1" style={{ color: card.color }}>{card.count}</p>
                <p className="text-xs text-gray-500 leading-tight">{card.label}</p>
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto flex-shrink-0">
            {TABS.map(tab => {
              const count = getTabTasks(tab.key, tasks).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                  style={activeTab === tab.key
                    ? { background: "#6366f1", color: "#fff" }
                    : { color: "#6b7280" }
                  }
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className="ml-1.5 text-xs rounded-full px-1.5 py-0.5 font-semibold"
                      style={activeTab === tab.key
                        ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                        : { background: "#e2e8f0", color: "#64748b" }
                      }
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <select
              value={filters.type}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:border-indigo-400"
            >
              <option value="">Todas as áreas</option>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>

            <select
              value={filters.priority}
              onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:border-indigo-400"
            >
              <option value="">Todas as prioridades</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>

            {clientOptions.length > 0 && (
              <select
                value={filters.clientId}
                onChange={e => setFilters(f => ({ ...f, clientId: e.target.value }))}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:border-indigo-400"
              >
                <option value="">Todos os alunos</option>
                {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            {hasFilters && (
              <button
                onClick={() => setFilters({ type: "", priority: "", clientId: "" })}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {displayedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Check className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">{TAB_EMPTY[activeTab]}</p>
                {activeTab === "today" && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Criar tarefa para hoje
                  </button>
                )}
              </div>
            ) : (
              <div>
                {displayedTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                    onDelay={handleDelay}
                    onSetWaiting={handleSetWaiting}
                    onCancel={handleCancel}
                    onAddSubtask={handleAddSubtask}
                    onToggleSubtask={handleToggleSubtask}
                    onDeleteSubtask={handleDeleteSubtask}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add task modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Nova tarefa</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Título *"
                value={addForm.title}
                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }}
                className={inputCls}
                autoFocus
              />
              <textarea
                placeholder="Descrição (opcional)"
                value={addForm.description}
                onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Data (opcional)</label>
                  <input
                    type="date"
                    value={addForm.dueDate}
                    onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Prioridade</label>
                  <select
                    value={addForm.priority}
                    onChange={e => setAddForm(f => ({ ...f, priority: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Área</label>
                <select
                  value={addForm.type}
                  onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                  className={inputCls}
                >
                  {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddTask}
                disabled={saving || !addForm.title.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "#6366f1" }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Criar tarefa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

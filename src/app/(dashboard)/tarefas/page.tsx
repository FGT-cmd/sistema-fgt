"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, ChevronDown, ChevronRight, Trash2, Loader2,
  Calendar, User, Tag, MoreHorizontal, Check, Circle, Pencil, X,
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
  status: "pending" | "in_progress" | "done";
  type: string;
  source: string;
  urgent: boolean | null;
  important: boolean | null;
  client: { id: string; name: string } | null;
  subtasks: Subtask[];
};

type Group = {
  key: string;
  label: string;
  tasks: TodoTask[];
  emptyHint: string;
  urgent?: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPES = [
  { id: "general",        label: "Geral" },
  { id: "student",        label: "Aluno" },
  { id: "financial",      label: "Financeiro" },
  { id: "content",        label: "Conteúdo" },
  { id: "commercial",     label: "Comercial" },
  { id: "administrative", label: "Administrativo" },
];

const SOURCES = [
  { id: "manual",    label: "Manual" },
  { id: "whatsapp",  label: "WhatsApp" },
  { id: "automatic", label: "Automática" },
];

const TYPE_COLORS: Record<string, string> = {
  general:        "#6366f1",
  student:        "#10b981",
  financial:      "#f59e0b",
  content:        "#3b82f6",
  commercial:     "#ec4899",
  administrative: "#8b5cf6",
};

const TYPE_BG: Record<string, string> = {
  general:        "#eef2ff",
  student:        "#f0fdf4",
  financial:      "#fffbeb",
  content:        "#eff6ff",
  commercial:     "#fdf2f8",
  administrative: "#f5f3ff",
};

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function tomorrow() {
  const d = today();
  d.setDate(d.getDate() + 1);
  return d;
}

function dayAfterTomorrow() {
  const d = today();
  d.setDate(d.getDate() + 2);
  return d;
}

function toDateOnly(iso: string) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

function groupTasks(tasks: TodoTask[]): Group[] {
  const td = today().getTime();
  const tm = tomorrow().getTime();
  const da = dayAfterTomorrow().getTime();

  const overdue: TodoTask[] = [];
  const todayList: TodoTask[] = [];
  const tomorrowList: TodoTask[] = [];
  const later: TodoTask[] = [];
  const noDate: TodoTask[] = [];

  for (const task of tasks) {
    if (!task.dueDate) { noDate.push(task); continue; }
    const t = toDateOnly(task.dueDate).getTime();
    if (t < td)      { overdue.push(task);   continue; }
    if (t === td)    { todayList.push(task);  continue; }
    if (t === tm)    { tomorrowList.push(task); continue; }
    if (t >= da)     { later.push(task);      continue; }
  }

  return [
    { key: "overdue",   label: "Atrasadas",  tasks: overdue,   emptyHint: "", urgent: true },
    { key: "today",     label: "Hoje",       tasks: todayList, emptyHint: "Nenhuma tarefa para hoje." },
    { key: "tomorrow",  label: "Amanhã",     tasks: tomorrowList, emptyHint: "Nenhuma tarefa para amanhã." },
    { key: "later",     label: "Depois",     tasks: later,     emptyHint: "Sem tarefas futuras." },
    { key: "noDate",    label: "Sem data",   tasks: noDate,    emptyHint: "Sem tarefas sem data." },
  ].filter((g) => g.key === "today" || g.tasks.length > 0);
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

// ─── TaskRow ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onComplete, onDelete, onUpdate, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  task: TodoTask;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<TodoTask>) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string, completed: boolean) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
}) {
  const [expanded,  setExpanded]  = useState(false);
  const [menu,      setMenu]      = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [subInput,  setSubInput]  = useState("");
  const [editForm,  setEditForm]  = useState({
    title: task.title,
    description: task.description ?? "",
    dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
    type: task.type,
  });
  const menuRef  = useRef<HTMLDivElement>(null);
  const subRef   = useRef<HTMLInputElement>(null);

  const typeLabel = TYPES.find((t) => t.id === task.type)?.label ?? task.type;
  const isOverdue = task.dueDate
    ? toDateOnly(task.dueDate).getTime() < today().getTime()
    : false;
  const doneSubtasks = task.subtasks.filter((s) => s.completed).length;

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!menu) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menu]);

  function handleSubAdd(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !subInput.trim()) return;
    onAddSubtask(task.id, subInput.trim());
    setSubInput("");
    // mantém o foco para digitar a próxima subtarefa
    setTimeout(() => subRef.current?.focus(), 50);
  }

  function handleEditSave() {
    onUpdate(task.id, {
      title: editForm.title.trim() || task.title,
      description: editForm.description || null,
      dueDate: editForm.dueDate || null,
      type: editForm.type,
    });
    setEditing(false);
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  return (
    <>
      <div className="group/task">
        <div
          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* Checkbox */}
          <button
            onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
            className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-indigo-500 flex items-center justify-center transition-colors"
          >
            <div className="w-2.5 h-2.5 rounded-full opacity-0 group-hover/task:opacity-30 bg-indigo-500 transition-opacity" />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800">{task.title}</span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ color: TYPE_COLORS[task.type], background: TYPE_BG[task.type] }}
              >
                {typeLabel}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {task.dueDate && (
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(task.dueDate)}
                  {isOverdue && " · atrasada"}
                </span>
              )}
              {task.client && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {task.client.name}
                </span>
              )}
              {task.subtasks.length > 0 && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {doneSubtasks}/{task.subtasks.length}
                </span>
              )}
            </div>
          </div>

          {/* Menu + expand */}
          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((v) => !v)}
                className="opacity-0 group-hover/task:opacity-100 p-1 rounded hover:bg-gray-100 text-gray-400 transition-all"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menu && (
                <div className="absolute right-0 top-7 bg-white border border-gray-100 rounded-xl shadow-lg z-30 py-1 w-36">
                  <button
                    onClick={() => { setMenu(false); setEditing(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="w-3 h-3 text-indigo-400" /> Editar
                  </button>
                  <button
                    onClick={() => { setMenu(false); onComplete(task.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Check className="w-3 h-3 text-green-500" /> Concluir
                  </button>
                  <div className="my-1 border-t border-gray-50" />
                  <button
                    onClick={() => { setMenu(false); onDelete(task.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" /> Excluir
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

      {/* Expanded: description + subtasks */}
      {expanded && (
        <div className="mx-4 mb-3 pl-8 space-y-3">
          {task.description && (
            <p className="text-sm text-gray-500 leading-relaxed">{task.description}</p>
          )}

          {/* Subtasks */}
          <div className="space-y-0.5">
            {task.subtasks.map((sub) => (
              <SubtaskRow
                key={sub.id}
                sub={sub}
                taskId={task.id}
                onToggle={(subId, completed) => onToggleSubtask(task.id, subId, completed)}
                onDelete={(subId) => onDeleteSubtask(task.id, subId)}
              />
            ))}
            {/* Add subtask — Enter cria a próxima */}
            <div className="flex items-center gap-2 pt-1">
              <Plus className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              <input
                ref={subRef}
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={handleSubAdd}
                placeholder="Adicionar subtarefa... (Enter para criar)"
                className="text-sm text-gray-500 placeholder-gray-300 bg-transparent outline-none flex-1"
              />
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Modal de edição */}
    {editing && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={() => setEditing(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
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
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
              autoFocus
            />
            <textarea
              placeholder="Descrição (opcional)"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className={`${inputCls} resize-none`}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Data</label>
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                  className={inputCls}
                >
                  {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
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

// ─── KanbanView ──────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { id: "pending",     label: "A Fazer",      color: "#6366f1", bg: "#eef2ff" },
  { id: "in_progress", label: "Em Andamento", color: "#f59e0b", bg: "#fffbeb" },
  { id: "done",        label: "Concluída",    color: "#10b981", bg: "#f0fdf4" },
];

function KanbanCard({ task, onDragStart, onClick }: {
  task: TodoTask;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const doneCount = task.subtasks.filter((s) => s.completed).length;
  const dragged = useRef(false);

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
          className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color: TYPE_COLORS[task.type], background: TYPE_BG[task.type] }}
        >
          {TYPES.find((t) => t.id === task.type)?.label ?? task.type}
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

// Painel lateral estilo Pipefy
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
  const col = KANBAN_COLS.find((c) => c.id === task.status) ?? KANBAN_COLS[0];
  const doneCount = task.subtasks.filter((s) => s.completed).length;

  function handleSubAdd(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !subInput.trim()) return;
    onAddSubtask(task.id, subInput.trim());
    setSubInput("");
    setTimeout(() => subRef.current?.focus(), 50);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-snug">{task.title}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: TYPE_COLORS[task.type], background: TYPE_BG[task.type] }}
              >
                {TYPES.find((t) => t.id === task.type)?.label ?? task.type}
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

        {/* Status selector */}
        <div className="px-5 py-3 border-b border-gray-50 flex gap-2">
          {KANBAN_COLS.map((c) => (
            <button
              key={c.id}
              onClick={() => onStatusChange(task.id, c.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={task.status === c.id
                ? { background: c.color, color: "#fff" }
                : { background: "#f1f5f9", color: "#6b7280" }
              }
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Description */}
          {task.description && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Descrição</p>
              <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
            </div>
          )}

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Subtarefas
              </p>
              {task.subtasks.length > 0 && (
                <span className="text-xs text-gray-400">
                  {doneCount}/{task.subtasks.length} concluídas
                </span>
              )}
            </div>

            {/* Progress bar */}
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
              {task.subtasks.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 py-2 group/sub px-2 rounded-lg hover:bg-gray-50">
                  <button
                    onClick={() => onToggleSubtask(task.id, sub.id, !sub.completed)}
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      sub.completed
                        ? "border-indigo-500 bg-indigo-500"
                        : "border-gray-300 hover:border-indigo-400"
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

            {/* Add subtask */}
            <div className="flex items-center gap-3 mt-2 px-2 py-2 rounded-lg border border-dashed border-gray-200 hover:border-indigo-300 transition-colors">
              <Plus className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <input
                ref={subRef}
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={handleSubAdd}
                placeholder="Nova subtarefa… (Enter para criar)"
                className="text-sm text-gray-600 placeholder-gray-300 bg-transparent outline-none flex-1"
              />
            </div>
          </div>

          {/* Client */}
          {task.client && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Aluno</p>
              <p className="text-sm text-gray-700">{task.client.name}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function KanbanView({ tasks, onStatusChange, onAdd, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  tasks: TodoTask[];
  onStatusChange: (id: string, status: string) => void;
  onAdd: () => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string, completed: boolean) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
}) {
  const [dragging,      setDragging]      = useState<string | null>(null);
  const [dragOver,      setDragOver]      = useState<string | null>(null);
  const [selectedTask,  setSelectedTask]  = useState<TodoTask | null>(null);

  // Sync selectedTask when tasks array updates (subtasks change)
  const currentSelected = selectedTask
    ? tasks.find((t) => t.id === selectedTask.id) ?? null
    : null;

  function handleDrop(colId: string) {
    if (!dragging) return;
    const task = tasks.find((t) => t.id === dragging);
    if (task && task.status !== colId) onStatusChange(dragging, colId);
    setDragging(null);
    setDragOver(null);
  }

  return (
    <div className="flex gap-4 flex-1 overflow-x-auto pb-4">
      {KANBAN_COLS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-72 flex flex-col rounded-2xl transition-colors"
            style={{ background: dragOver === col.id ? col.bg : "#f1f5f9" }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
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
              {colTasks.map((task) => (
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

      {/* Detail panel */}
      {currentSelected && (
        <KanbanDetailPanel
          task={currentSelected}
          onClose={() => setSelectedTask(null)}
          onAddSubtask={onAddSubtask}
          onToggleSubtask={onToggleSubtask}
          onDeleteSubtask={onDeleteSubtask}
          onStatusChange={(id, status) => { onStatusChange(id, status); }}
        />
      )}
    </div>
  );
}

// ─── EisenhowerView ──────────────────────────────────────────────────────────

const QUADRANTS = [
  { urgent: true,  important: true,  label: "Fazer Agora",  sub: "Urgente + Importante",     color: "#ef4444", bg: "#fef2f2", border: "#fecaca" },
  { urgent: false, important: true,  label: "Agendar",      sub: "Importante, não urgente",   color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
  { urgent: true,  important: false, label: "Delegar",      sub: "Urgente, não importante",   color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  { urgent: false, important: false, label: "Eliminar",     sub: "Não urgente, não importante", color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0" },
];

function EisenhowerCard({ task, onToggle }: {
  task: TodoTask;
  onToggle: (id: string, field: "urgent" | "important", value: boolean) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <p className="text-sm font-medium text-gray-800 mb-2 leading-snug">{task.title}</p>
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ color: TYPE_COLORS[task.type], background: TYPE_BG[task.type] }}
        >
          {TYPES.find((t) => t.id === task.type)?.label ?? task.type}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle(task.id, "urgent", !task.urgent)}
            title="Urgente"
            className="text-xs font-bold w-6 h-6 rounded-md flex items-center justify-center transition-colors"
            style={task.urgent ? { background: "#ef4444", color: "#fff" } : { background: "#f1f5f9", color: "#94a3b8" }}
          >
            U
          </button>
          <button
            onClick={() => onToggle(task.id, "important", !task.important)}
            title="Importante"
            className="text-xs font-bold w-6 h-6 rounded-md flex items-center justify-center transition-colors"
            style={task.important ? { background: "#6366f1", color: "#fff" } : { background: "#f1f5f9", color: "#94a3b8" }}
          >
            I
          </button>
        </div>
      </div>
    </div>
  );
}

function EisenhowerView({ tasks, onToggle, onCreate }: {
  tasks: TodoTask[];
  onToggle: (id: string, field: "urgent" | "important", value: boolean) => void;
  onCreate: (title: string, urgent: boolean, important: boolean) => void;
}) {
  const [addingTo,  setAddingTo]  = useState<string | null>(null); // quadrant key
  const [addTitle,  setAddTitle]  = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  const unclassified = tasks.filter((t) => t.urgent === null || t.important === null);
  const classified   = tasks.filter((t) => t.urgent !== null && t.important !== null);

  function tasksForQuadrant(q: typeof QUADRANTS[0]) {
    return classified.filter((t) => t.urgent === q.urgent && t.important === q.important);
  }

  function quadrantKey(q: typeof QUADRANTS[0]) { return `${q.urgent}-${q.important}`; }

  function handleAddKeyDown(e: React.KeyboardEvent, q: typeof QUADRANTS[0]) {
    if (e.key === "Escape") { setAddingTo(null); setAddTitle(""); }
    if (e.key === "Enter" && addTitle.trim()) {
      onCreate(addTitle.trim(), q.urgent, q.important);
      setAddTitle("");
      setTimeout(() => addRef.current?.focus(), 50);
    }
  }

  function openAdd(key: string) {
    setAddingTo(key);
    setAddTitle("");
    setTimeout(() => addRef.current?.focus(), 50);
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-6">
      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-4">
        {QUADRANTS.map((q) => {
          const qTasks = tasksForQuadrant(q);
          const key    = quadrantKey(q);
          const isAdding = addingTo === key;
          return (
            <div
              key={key}
              className="rounded-2xl p-4 flex flex-col gap-2 min-h-48"
              style={{ background: q.bg, border: `1.5px solid ${q.border}` }}
            >
              {/* Quadrant header */}
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: q.color }} />
                <span className="text-sm font-bold" style={{ color: q.color }}>{q.label}</span>
                <span className="text-xs font-medium rounded-full px-1.5 py-0.5" style={{ background: "rgba(0,0,0,0.06)", color: q.color }}>
                  {qTasks.length}
                </span>
                <button
                  onClick={() => isAdding ? setAddingTo(null) : openAdd(key)}
                  className="ml-auto w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                  style={{ background: "rgba(0,0,0,0.06)", color: q.color }}
                  title="Adicionar tarefa"
                >
                  {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs pl-4 -mt-1 mb-1" style={{ color: q.color, opacity: 0.65 }}>{q.sub}</p>

              {/* Inline add */}
              {isAdding && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border shadow-sm"
                  style={{ borderColor: q.border }}
                >
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: q.color }} />
                  <input
                    ref={addRef}
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    onKeyDown={(e) => handleAddKeyDown(e, q)}
                    placeholder="Título da tarefa… Enter para criar"
                    className="text-sm bg-transparent outline-none flex-1 text-gray-700 placeholder-gray-300"
                  />
                </div>
              )}

              {/* Task cards */}
              <div className="space-y-2">
                {qTasks.length === 0 && !isAdding && (
                  <p className="text-xs text-center py-3 opacity-40" style={{ color: q.color }}>
                    Nenhuma tarefa aqui
                  </p>
                )}
                {qTasks.map((t) => (
                  <EisenhowerCard key={t.id} task={t} onToggle={onToggle} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sem classificação */}
      {unclassified.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Sem classificação
            </span>
            <span className="text-xs bg-gray-100 text-gray-400 rounded-full px-1.5 py-0.5 font-medium">
              {unclassified.length}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Use os botões <strong>U</strong> (urgente) e <strong>I</strong> (importante) para classificar cada tarefa.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unclassified.map((t) => (
              <EisenhowerCard key={t.id} task={t} onToggle={onToggle} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GroupSection ─────────────────────────────────────────────────────────────

function GroupSection({
  group, onComplete, onDelete, onUpdate, onAddSubtask,
  onToggleSubtask, onDeleteSubtask, quickAddGroup, setQuickAddGroup,
  quickAddTitle, setQuickAddTitle, quickAddDate, onQuickAdd,
}: {
  group: Group;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<TodoTask>) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string, completed: boolean) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
  quickAddGroup: string | null;
  setQuickAddGroup: (g: string | null) => void;
  quickAddTitle: string;
  setQuickAddTitle: (v: string) => void;
  quickAddDate: string;
  onQuickAdd: (groupKey: string, title: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const headerColor = group.urgent ? "#ef4444" : "#6b7280";

  return (
    <div className="mb-2">
      {/* Section header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" style={{ color: headerColor }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: headerColor }} />}
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: headerColor }}>
          {group.label}
        </span>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full ml-1" style={{
          background: group.urgent ? "#fee2e2" : "#f1f5f9",
          color: group.urgent ? "#ef4444" : "#94a3b8",
        }}>
          {group.tasks.length}
        </span>
      </button>

      {!collapsed && (
        <div className="relative">
          {group.tasks.length === 0 && (
            <p className="text-sm text-gray-300 px-12 py-2">{group.emptyHint}</p>
          )}
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onAddSubtask={onAddSubtask}
              onToggleSubtask={onToggleSubtask}
              onDeleteSubtask={onDeleteSubtask}
            />
          ))}

          {/* Quick add row */}
          {quickAddGroup === group.key ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-5 h-5 rounded-full border-2 border-indigo-400 flex-shrink-0" />
              <input
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && quickAddTitle.trim()) onQuickAdd(group.key, quickAddTitle.trim());
                  if (e.key === "Escape") { setQuickAddGroup(null); setQuickAddTitle(""); }
                }}
                placeholder="Título da tarefa..."
                className="flex-1 text-sm text-gray-700 bg-transparent outline-none"
                autoFocus
              />
              <button onClick={() => { setQuickAddGroup(null); setQuickAddTitle(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
              <button
                onClick={() => { if (quickAddTitle.trim()) onQuickAdd(group.key, quickAddTitle.trim()); }}
                className="text-xs font-medium text-white px-3 py-1.5 rounded-lg"
                style={{ background: "#6366f1" }}
              >
                Adicionar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setQuickAddGroup(group.key)}
              className="flex items-center gap-2 px-12 py-2 text-sm text-gray-300 hover:text-indigo-500 transition-colors w-full text-left"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar tarefa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main TarefasPage ─────────────────────────────────────────────────────────

type ViewMode = "list" | "kanban" | "eisenhower";

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: "list",        label: "Lista" },
  { id: "kanban",      label: "Kanban" },
  { id: "eisenhower",  label: "Eisenhower" },
];

export default function TarefasPage() {
  const [tasks,           setTasks]           = useState<TodoTask[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [view,            setView]            = useState<ViewMode>("list");
  const [quickAddGroup,   setQuickAddGroup]   = useState<string | null>(null);
  const [quickAddTitle,   setQuickAddTitle]   = useState("");
  const [showGlobalAdd,   setShowGlobalAdd]   = useState(false);
  const [globalForm,      setGlobalForm]      = useState({
    title: "", description: "", dueDate: "", type: "general", clientId: "", source: "manual",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tarefas?status=all");
    const data = await res.json();
    setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered per view
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const groups = groupTasks(activeTasks);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleComplete(id: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "done" } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  }

  async function handleStatusChange(id: string, status: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: status as TodoTask["status"] } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function handleEisenhowerToggle(id: string, field: "urgent" | "important", value: boolean) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function handleEisenhowerCreate(title: string, urgent: boolean, important: boolean) {
    const res = await fetch("/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, urgent, important }),
    });
    const task = await res.json();
    setTasks((prev) => [...prev, task]);
  }

  async function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tarefas/${id}`, { method: "DELETE" });
  }

  async function handleUpdate(id: string, data: Partial<TodoTask>) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...data } : t));
    await fetch(`/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function handleAddSubtask(taskId: string, title: string) {
    const res = await fetch(`/api/tarefas/${taskId}/subtarefas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const sub = await res.json();
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, subtasks: [...t.subtasks, sub] } : t
    ));
  }

  async function handleToggleSubtask(taskId: string, subId: string, completed: boolean) {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId
        ? { ...t, subtasks: t.subtasks.map((s) => s.id === subId ? { ...s, completed } : s) }
        : t
    ));
    await fetch(`/api/tarefas/${taskId}/subtarefas/${subId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
  }

  async function handleDeleteSubtask(taskId: string, subId: string) {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) } : t
    ));
    await fetch(`/api/tarefas/${taskId}/subtarefas/${subId}`, { method: "DELETE" });
  }

  function dueDateForGroup(groupKey: string): string | undefined {
    if (groupKey === "today") return new Date().toISOString().split("T")[0];
    if (groupKey === "tomorrow") {
      const d = new Date(); d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    }
    return undefined;
  }

  async function handleQuickAdd(groupKey: string, title: string) {
    setSaving(true);
    const dueDate = dueDateForGroup(groupKey);
    const res = await fetch("/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate: dueDate ?? null }),
    });
    const task = await res.json();
    setTasks((prev) => [...prev, task]);
    setQuickAddTitle("");
    setQuickAddGroup(null);
    setSaving(false);
  }

  async function handleGlobalAdd() {
    if (!globalForm.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: globalForm.title.trim(),
        description: globalForm.description || null,
        dueDate: globalForm.dueDate || null,
        type: globalForm.type,
        source: globalForm.source,
        clientId: globalForm.clientId || null,
      }),
    });
    const task = await res.json();
    setTasks((prev) => [...prev, task]);
    setGlobalForm({ title: "", description: "", dueDate: "", type: "general", clientId: "", source: "manual" });
    setShowGlobalAdd(false);
    setSaving(false);
  }

  const pendingCount = activeTasks.filter((t) => t.status === "pending").length;
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  const isWide = view === "kanban" || view === "eisenhower";

  return (
    <div className={`p-8 h-full flex flex-col ${isWide ? "" : "max-w-3xl mx-auto"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {pendingCount === 0 ? "Tudo em dia" : `${pendingCount} pendente${pendingCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowGlobalAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "#6366f1" }}
        >
          <Plus className="w-4 h-4" />
          Nova tarefa
        </button>
      </div>

      {/* View switcher */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={view === tab.id
              ? { background: "#6366f1", color: "#fff" }
              : { color: "#6b7280" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      ) : (
        <>
          {/* LIST */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto -mx-4">
              {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                    <Check className="w-7 h-7 text-indigo-400" />
                  </div>
                  <p className="font-semibold text-gray-600">Tudo em dia!</p>
                  <p className="text-sm text-gray-400 mt-1">Nenhuma tarefa pendente.</p>
                  <button onClick={() => setShowGlobalAdd(true)} className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                    Criar uma tarefa
                  </button>
                </div>
              ) : (
                groups.map((group) => (
                  <GroupSection
                    key={group.key}
                    group={group}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                    onAddSubtask={handleAddSubtask}
                    onToggleSubtask={handleToggleSubtask}
                    onDeleteSubtask={handleDeleteSubtask}
                    quickAddGroup={quickAddGroup}
                    setQuickAddGroup={setQuickAddGroup}
                    quickAddTitle={quickAddTitle}
                    setQuickAddTitle={setQuickAddTitle}
                    quickAddDate={dueDateForGroup(quickAddGroup ?? "") ?? ""}
                    onQuickAdd={handleQuickAdd}
                  />
                ))
              )}
            </div>
          )}

          {/* KANBAN */}
          {view === "kanban" && (
            <KanbanView
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onAdd={() => setShowGlobalAdd(true)}
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={handleDeleteSubtask}
            />
          )}

          {/* EISENHOWER */}
          {view === "eisenhower" && (
            <EisenhowerView
              tasks={activeTasks}
              onToggle={handleEisenhowerToggle}
              onCreate={handleEisenhowerCreate}
            />
          )}
        </>
      )}

      {/* Modal: nova tarefa completa */}
      {showGlobalAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowGlobalAdd(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-5">Nova tarefa</h2>
            <div className="space-y-3">
              <input
                placeholder="Título *"
                value={globalForm.title}
                onChange={(e) => setGlobalForm((f) => ({ ...f, title: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleGlobalAdd(); }}
                className={inputCls}
                autoFocus
              />
              <textarea
                placeholder="Descrição (opcional)"
                value={globalForm.description}
                onChange={(e) => setGlobalForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Data (opcional)</label>
                  <input
                    type="date"
                    value={globalForm.dueDate}
                    onChange={(e) => setGlobalForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                  <select
                    value={globalForm.type}
                    onChange={(e) => setGlobalForm((f) => ({ ...f, type: e.target.value }))}
                    className={inputCls}
                  >
                    {TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Origem</label>
                <select
                  value={globalForm.source}
                  onChange={(e) => setGlobalForm((f) => ({ ...f, source: e.target.value }))}
                  className={inputCls}
                >
                  {SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowGlobalAdd(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleGlobalAdd}
                disabled={saving || !globalForm.title.trim()}
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

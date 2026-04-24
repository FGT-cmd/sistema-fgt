"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, MoreHorizontal, Loader2, Trash2, X } from "lucide-react";

type Task    = { id: string; title: string; priority: "low" | "medium" | "high"; dueDate?: string | null; status: string };
type Client  = { id: string; name: string };
type Project = { id: string; name: string; description?: string | null; status: string; progress: number; client: Client; tasks: Task[] };

const columns = [
  { id: "todo",        label: "A Fazer",       color: "#94a3b8" },
  { id: "in_progress", label: "Em Andamento",  color: "#6366f1" },
  { id: "done",        label: "Concluído",      color: "#10b981" },
];

const priorityColor = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };
const priorityLabel = { low: "Baixa", medium: "Média", high: "Alta" };

function calcProgress(tasks: Task[]) {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
}

// ─── TaskCard ─────────────────────────────────────────────────────

function TaskCard({ task, projectId, onUpdate, onDelete }: {
  task: Task;
  projectId: string;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);

  async function handleDelete() {
    setMenu(false);
    await fetch(`/api/projetos/${projectId}/tarefas/${task.id}`, { method: "DELETE" });
    onDelete(task.id);
  }

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
      className="bg-white rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing border border-gray-100 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-800 flex-1 pr-1">{task.title}</p>
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className="text-gray-300 hover:text-gray-500">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-5 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1 w-32">
              <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50">
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor[task.priority] }} />
        <span className="text-xs text-gray-400">{priorityLabel[task.priority]}</span>
        {task.dueDate && (
          <span className="text-xs text-gray-400 ml-auto">
            {new Date(task.dueDate + "T12:00").toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ProjetosPage ─────────────────────────────────────────────────

export default function ProjetosPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [clients,      setClients]      = useState<Client[]>([]);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [showProject,  setShowProject]  = useState(false);
  const [showTask,     setShowTask]     = useState(false);
  const [projectForm,  setProjectForm]  = useState({ name: "", description: "", clientId: "", clientName: "" });
  const [taskForm,     setTaskForm]     = useState({ title: "", priority: "medium" as Task["priority"], dueDate: "" });
  const [saving,       setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [projRes, clientRes] = await Promise.all([
      fetch("/api/projetos").then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/crm/clients").then((r) => r.ok ? r.json() : []).catch(() => []),
    ]);
    setProjects(Array.isArray(projRes) ? projRes : []);
    setClients(Array.isArray(clientRes) ? clientRes : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentProject = projects.find((p) => p.id === selected);

  const handleDrop = async (status: string, e: React.DragEvent) => {
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId || !selected) return;
    const task = currentProject?.tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;

    setProjects((prev) => prev.map((p) => {
      if (p.id !== selected) return p;
      const tasks = p.tasks.map((t) => t.id === taskId ? { ...t, status } : t);
      return { ...p, tasks, progress: calcProgress(tasks) };
    }));

    await fetch(`/api/projetos/${selected}/tarefas/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...task, status }),
    });
  };

  const addProject = async () => {
    if (!projectForm.name) return;
    setSaving(true);
    const res  = await fetch("/api/projetos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectForm),
    });
    const proj = await res.json();
    setProjects((prev) => [proj, ...prev]);
    setSelected(proj.id);
    setShowProject(false);
    setProjectForm({ name: "", description: "", clientId: "", clientName: "" });
    setSaving(false);
  };

  const addTask = async () => {
    if (!taskForm.title || !selected) return;
    setSaving(true);
    const res  = await fetch(`/api/projetos/${selected}/tarefas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...taskForm, status: "todo" }),
    });
    const task = await res.json();
    setProjects((prev) => prev.map((p) => {
      if (p.id !== selected) return p;
      const tasks = [...p.tasks, task];
      return { ...p, tasks, progress: calcProgress(tasks) };
    }));
    setShowTask(false);
    setTaskForm({ title: "", priority: "medium", dueDate: "" });
    setSaving(false);
  };

  const deleteTask = (taskId: string) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== selected) return p;
      const tasks = p.tasks.filter((t) => t.id !== taskId);
      return { ...p, tasks, progress: calcProgress(tasks) };
    }));
  };

  const tasksByStatus = (status: string) => currentProject?.tasks.filter((t) => t.status === status) ?? [];

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos & Tarefas</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie entregas por cliente</p>
        </div>
        <button
          onClick={() => setShowProject(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "#6366f1" }}
        >
          <Plus className="w-4 h-4" /> Novo Projeto
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="flex gap-5 flex-1 min-h-0">
          {/* Lista de projetos */}
          <div className="w-56 flex-shrink-0 space-y-2 overflow-y-auto">
            {projects.length === 0 && (
              <p className="text-sm text-gray-400 text-center pt-8">Nenhum projeto ainda</p>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${selected === p.id ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
              >
                <p className={`text-sm font-medium truncate ${selected === p.id ? "text-indigo-700" : "text-gray-800"}`}>{p.name}</p>
                <p className="text-xs text-gray-400 truncate">{p.client?.name || "Sem cliente"}</p>
                <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${p.progress}%`, background: "#6366f1" }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{p.progress}% concluído</p>
              </button>
            ))}
          </div>

          {/* Kanban */}
          <div className="flex-1 min-h-0">
            {!currentProject ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Selecione um projeto para ver as tarefas
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-gray-800">{currentProject.name}</h2>
                    <p className="text-xs text-gray-400">{currentProject.client?.name} · {currentProject.tasks.length} tarefas</p>
                  </div>
                  <button
                    onClick={() => setShowTask(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tarefa
                  </button>
                </div>

                <div className="flex gap-4 h-[calc(100%-56px)]">
                  {columns.map((col) => {
                    const colTasks = tasksByStatus(col.id);
                    return (
                      <div
                        key={col.id}
                        className="flex-1 rounded-xl flex flex-col"
                        style={{ background: "#f1f5f9" }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(col.id, e)}
                      >
                        <div className="px-3 py-3 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                          <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                          <span className="text-xs text-gray-400 bg-white rounded-full px-1.5">{colTasks.length}</span>
                        </div>
                        <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
                          {colTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              projectId={currentProject.id}
                              onUpdate={(updated) => setProjects((prev) => prev.map((p) =>
                                p.id === selected ? { ...p, tasks: p.tasks.map((t) => t.id === updated.id ? updated : t) } : p
                              ))}
                              onDelete={deleteTask}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Projeto */}
      {showProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProject(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Novo Projeto</h2>
              <button onClick={() => setShowProject(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Nome do projeto *" value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
              <input placeholder="Descrição" value={projectForm.description} onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
              {clients.length > 0 ? (
                <select value={projectForm.clientId} onChange={(e) => setProjectForm((f) => ({ ...f, clientId: e.target.value, clientName: "" }))} className={inputCls}>
                  <option value="">Selecionar cliente...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <input placeholder="Nome do cliente" value={projectForm.clientName} onChange={(e) => setProjectForm((f) => ({ ...f, clientName: e.target.value }))} className={inputCls} />
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowProject(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100">Cancelar</button>
              <button onClick={addProject} disabled={!projectForm.name || saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: "#6366f1" }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tarefa */}
      {showTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTask(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Nova Tarefa</h2>
              <button onClick={() => setShowTask(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Título *" value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <select value={taskForm.priority} onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value as Task["priority"] }))} className={inputCls}>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
                <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowTask(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100">Cancelar</button>
              <button onClick={addTask} disabled={!taskForm.title || saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: "#6366f1" }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

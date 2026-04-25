"use client";

import { useState, useEffect } from "react";
import {
  Plus, Search, X, Trash2, Phone, Mail, Users,
  CheckCircle2, AlertTriangle, ChevronRight,
  DollarSign, FileText, Edit2, Save,
} from "lucide-react";

type Installment = { id: string; status: string; dueDate: string; amount: number };
type Sale = { id: string; description: string; totalAmount: number; installments: Installment[] };
type FinancialTx = { id: string; description: string; amount: number; status: string; dueDate?: string; type: string };

type Aluno = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: string;
  tags: string[];
  createdAt: string;
  sales: Sale[];
  financialTxs: FinancialTx[];
};

const STATUS_OPTIONS = [
  { value: "ativo",   label: "Ativo",   color: "bg-green-100 text-green-700" },
  { value: "inativo", label: "Inativo", color: "bg-gray-100 text-gray-500" },
  { value: "lead",    label: "Lead",    color: "bg-blue-100 text-blue-600" },
  { value: "pausado", label: "Pausado", color: "bg-amber-100 text-amber-600" },
];

function statusConfig(s: string) {
  return STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];
}

function financialHealth(aluno: Aluno): "green" | "red" {
  const vencidas = aluno.sales.flatMap(s => s.installments).filter(i =>
    i.status !== "pago" && new Date(i.dueDate) < new Date()
  );
  return vencidas.length > 0 ? "red" : "green";
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(dt);
}

// ─── Modal Novo Aluno ─────────────────────────────────────────────
function NovoAlunoModal({ onClose, onSave }: { onClose: () => void; onSave: (a: Aluno) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", status: "ativo", notes: "" });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    const res = await fetch("/api/alunos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Novo Aluno</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nome *</label>
            <input required autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Nome completo"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Telefone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="(55) 99999-9999"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="email@exemplo.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observações</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas rápidas sobre o aluno..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#6366f1" }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Drawer Detalhe do Aluno ──────────────────────────────────────
function AlunoDrawer({ aluno, onClose, onUpdate, onDelete }: {
  aluno: Aluno;
  onClose: () => void;
  onUpdate: (a: Aluno) => void;
  onDelete: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ name: aluno.name, email: aluno.email || "", phone: aluno.phone || "", status: aluno.status, notes: aluno.notes || "" });
  const [saving, setSaving] = useState(false);

  const health = financialHealth(aluno);
  const totalPago = aluno.sales.flatMap(s => s.installments).filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0);
  const totalPendente = aluno.sales.flatMap(s => s.installments).filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0);
  const parcelasVencidas = aluno.sales.flatMap(s => s.installments).filter(i => i.status !== "pago" && new Date(i.dueDate) < new Date());

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/alunos/${aluno.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    onUpdate(await res.json());
    setSaving(false);
    setEditando(false);
  }

  async function handleDelete() {
    if (!confirm(`Remover ${aluno.name}?`)) return;
    await fetch(`/api/alunos/${aluno.id}`, { method: "DELETE" });
    onDelete(aluno.id);
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style={{ background: "#6366f1" }}>
              {getInitials(aluno.name)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{aluno.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig(aluno.status).color}`}>
                  {statusConfig(aluno.status).label.toUpperCase()}
                </span>
                {health === "red" && (
                  <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                    <AlertTriangle className="w-3 h-3" /> {parcelasVencidas.length} parcela{parcelasVencidas.length > 1 ? "s" : ""} vencida{parcelasVencidas.length > 1 ? "s" : ""}
                  </span>
                )}
                {health === "green" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
              </div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Info */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase">Informações</span>
              <button onClick={() => setEditando(!editando)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <Edit2 className="w-3 h-3" /> {editando ? "Cancelar" : "Editar"}
              </button>
            </div>
            {editando ? (
              <div className="space-y-3">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="Telefone" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="Email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Observações..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                <button onClick={handleSave} disabled={saving}
                  className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-1"
                  style={{ background: "#6366f1" }}>
                  <Save className="w-3.5 h-3.5" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {aluno.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="w-4 h-4 text-gray-400" /> {aluno.phone}
                  </div>
                )}
                {aluno.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail className="w-4 h-4 text-gray-400" /> {aluno.email}
                  </div>
                )}
                {aluno.notes && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 italic">{aluno.notes}</div>
                )}
                <p className="text-xs text-gray-400 mt-1">Desde {fmtDate(aluno.createdAt)}</p>
              </div>
            )}
          </div>

          {/* Financeiro */}
          <div className="p-5">
            <span className="text-xs font-bold text-gray-400 uppercase block mb-3">Financeiro</span>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                <p className="text-[10px] text-green-500 uppercase font-bold">Recebido</p>
                <p className="text-sm font-bold text-green-700">{fmt(totalPago)}</p>
              </div>
              <div className={`rounded-xl p-3 border ${parcelasVencidas.length > 0 ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <p className={`text-[10px] uppercase font-bold ${parcelasVencidas.length > 0 ? "text-red-500" : "text-amber-500"}`}>Pendente</p>
                <p className={`text-sm font-bold ${parcelasVencidas.length > 0 ? "text-red-700" : "text-amber-700"}`}>{fmt(totalPendente)}</p>
              </div>
            </div>
            {aluno.sales.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhuma venda registrada</p>
            ) : aluno.sales.map(sale => (
              <div key={sale.id} className="mb-2 bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800">{sale.description}</p>
                  <p className="text-xs font-bold text-gray-500">{fmt(sale.totalAmount)}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {sale.installments.map(inst => (
                    <span key={inst.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      inst.status === "pago" ? "bg-green-100 text-green-700"
                      : new Date(inst.dueDate) < new Date() ? "bg-red-100 text-red-600"
                      : "bg-gray-200 text-gray-500"
                    }`}>
                      {fmt(inst.amount)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100">
          <button onClick={handleDelete}
            className="w-full py-2 rounded-lg text-sm text-red-500 border border-red-200 hover:bg-red-50 flex items-center justify-center gap-1">
            <Trash2 className="w-4 h-4" /> Remover aluno
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────
export default function AlunosPage() {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [showNovo, setShowNovo] = useState(false);
  const [selected, setSelected] = useState<Aluno | null>(null);

  useEffect(() => {
    fetch("/api/alunos").then(r => r.json()).then(data => {
      setAlunos(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const filtered = alunos.filter(a => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.phone || "").includes(search) ||
      (a.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const ativos   = alunos.filter(a => a.status === "ativo").length;
  const leads    = alunos.filter(a => a.status === "lead").length;
  const criticos = alunos.filter(a => financialHealth(a) === "red").length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Alunos</h1>
            <p className="text-gray-400 text-sm mt-0.5">Gestão de alunos e clientes</p>
          </div>
          <button onClick={() => setShowNovo(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ background: "#6366f1" }}>
            <Plus className="w-4 h-4" /> Novo Aluno
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="bg-indigo-50 rounded-xl px-4 py-2 border border-indigo-100">
            <p className="text-[10px] text-indigo-400 uppercase font-bold">Total</p>
            <p className="text-lg font-bold text-indigo-700">{alunos.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl px-4 py-2 border border-green-100">
            <p className="text-[10px] text-green-500 uppercase font-bold">Ativos</p>
            <p className="text-lg font-bold text-green-700">{ativos}</p>
          </div>
          <div className="bg-blue-50 rounded-xl px-4 py-2 border border-blue-100">
            <p className="text-[10px] text-blue-400 uppercase font-bold">Leads</p>
            <p className="text-lg font-bold text-blue-600">{leads}</p>
          </div>
          {criticos > 0 && (
            <div className="bg-red-50 rounded-xl px-4 py-2 border border-red-100">
              <p className="text-[10px] text-red-400 uppercase font-bold">Inadimplentes</p>
              <p className="text-lg font-bold text-red-600">{criticos}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou email..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="flex gap-1">
            {["todos", "ativo", "lead", "pausado", "inativo"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === s ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
                style={filterStatus === s ? { background: "#6366f1" } : {}}>
                {s === "todos" ? "Todos" : statusConfig(s).label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-gray-400 text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <Users className="w-12 h-12 mb-3 text-gray-200" />
            <p className="text-sm">Nenhum aluno encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(aluno => {
              const health = financialHealth(aluno);
              const totalPago = aluno.sales.flatMap(s => s.installments).filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0);
              const totalPendente = aluno.sales.flatMap(s => s.installments).filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0);

              return (
                <button key={aluno.id} onClick={() => setSelected(aluno)}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:border-indigo-100 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ background: "#6366f1" }}>
                        {getInitials(aluno.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{aluno.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig(aluno.status).color}`}>
                          {statusConfig(aluno.status).label.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {health === "red"
                        ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </div>

                  {aluno.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                      <Phone className="w-3 h-3" /> {aluno.phone}
                    </div>
                  )}
                  {aluno.email && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                      <Mail className="w-3 h-3" /> {aluno.email}
                    </div>
                  )}

                  {(totalPago > 0 || totalPendente > 0) && (
                    <div className="flex gap-3 mt-2 pt-2 border-t border-gray-50">
                      {totalPago > 0 && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-green-500" />
                          <span className="text-xs font-semibold text-green-600">{fmt(totalPago)}</span>
                        </div>
                      )}
                      {totalPendente > 0 && (
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-amber-500" />
                          <span className={`text-xs font-semibold ${health === "red" ? "text-red-500" : "text-amber-600"}`}>{fmt(totalPendente)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {aluno.notes && (
                    <p className="text-xs text-gray-400 mt-2 truncate italic">{aluno.notes}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showNovo && (
        <NovoAlunoModal onClose={() => setShowNovo(false)}
          onSave={a => { setAlunos(prev => [a, ...prev]); setShowNovo(false); }} />
      )}
      {selected && (
        <AlunoDrawer aluno={selected} onClose={() => setSelected(null)}
          onUpdate={a => { setAlunos(prev => prev.map(x => x.id === a.id ? a : x)); setSelected(a); }}
          onDelete={id => { setAlunos(prev => prev.filter(x => x.id !== id)); setSelected(null); }} />
      )}
    </div>
  );
}

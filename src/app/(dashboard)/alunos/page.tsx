"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, Search, X, Trash2, Phone, Mail, Users,
  CheckCircle2, AlertTriangle, ChevronRight,
  DollarSign, Edit2, Save, Upload, ExternalLink,
  FileText, Filter,
} from "lucide-react";

type Installment = { id: string; status: string; dueDate: string; amount: number };
type Sale = { id: string; description: string; totalAmount: number; installments: Installment[] };
type StudentFile = { id: string; name: string; url: string; category: string };

type Aluno = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: string;
  source?: string | null;
  planName?: string | null;
  planDetails?: string | null;
  paymentMethod?: string | null;
  negotiationNotes?: string | null;
  contractUrl?: string | null;
  tags: string[];
  createdAt: string;
  sales: Sale[];
  files: StudentFile[];
};

type ServicePlan = { id: string; name: string; totalAmount: number };

const STATUS_OPTIONS = [
  { value: "ativo",   label: "Ativo",   color: "bg-green-100 text-green-700" },
  { value: "inativo", label: "Inativo", color: "bg-gray-100 text-gray-500" },
  { value: "lead",    label: "Lead",    color: "bg-blue-100 text-blue-600" },
  { value: "pausado", label: "Pausado", color: "bg-amber-100 text-amber-600" },
];

const PLAN_OPTIONS = [
  { value: "Trimestral",       label: "Trimestral",       details: false },
  { value: "Semestral",        label: "Semestral",        details: false },
  { value: "Anual",            label: "Anual",            details: false },
  { value: "Personalizado",    label: "Personalizado",    details: true  },
  { value: "Parceria/Collab",  label: "Parceria / Collab", details: true },
];

const FUNIL_OPTIONS = ["Instagram", "Indicação", "WhatsApp", "TikTok", "Google", "Site", "Evento", "Outro"];
const PAYMENT_METHODS = ["Pix", "Débito", "Crédito", "Transferência", "Boleto", "Dinheiro"];

function planNeedsDetails(planName: string) {
  return PLAN_OPTIONS.find(p => p.value === planName)?.details ?? false;
}

function statusCfg(s: string) {
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
  return isNaN(dt.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR").format(dt);
}

// ─── Form Fields (reutilizável) ───────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

// ─── Modal Novo Aluno ─────────────────────────────────────────────
function NovoAlunoModal({ plans, onClose, onSave }: {
  plans: ServicePlan[];
  onClose: () => void;
  onSave: (a: Aluno) => void;
}) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", status: "ativo", source: "",
    planName: "", planDetails: "", paymentMethod: "Pix", negotiationNotes: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Novo Aluno</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3 overflow-y-auto flex-1">
          <Field label="Nome *">
            <input required autoFocus value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone">
              <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(55) 99999-9999" className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@exemplo.com" className={inputCls} />
          </Field>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Plano & Pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plano">
                <select value={form.planName} onChange={e => set("planName", e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Forma de Pagamento">
                <select value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)} className={inputCls}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            {planNeedsDetails(form.planName) && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                <p className="text-xs font-semibold text-indigo-600 mb-1.5">
                  {form.planName === "Parceria/Collab" ? "Descreva a parceria / collab" : "Descreva o plano personalizado"}
                </p>
                <textarea rows={3} value={form.planDetails} onChange={e => set("planDetails", e.target.value)}
                  placeholder={form.planName === "Parceria/Collab"
                    ? "Ex: 3 meses grátis em troca de divulgação, parceria com marca X..."
                    : "Ex: 2x por semana online + 1x presencial, valor negociado..."}
                  className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white resize-none" />
              </div>
            )}
          </div>

          <Field label="De qual funil veio?">
            <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
              <option value="">Selecionar...</option>
              {FUNIL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          <Field label="Negociação">
            <textarea rows={2} value={form.negotiationNotes} onChange={e => set("negotiationNotes", e.target.value)}
              placeholder="Condições especiais, descontos..." className={`${inputCls} resize-none`} />
          </Field>
          <Field label="Observações">
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Notas gerais..." className={`${inputCls} resize-none`} />
          </Field>

          <div className="flex gap-2 pt-1 shrink-0">
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

// ─── Drawer Detalhe ───────────────────────────────────────────────
function AlunoDrawer({ aluno, plans, onClose, onUpdate, onDelete }: {
  aluno: Aluno; plans: ServicePlan[];
  onClose: () => void; onUpdate: (a: Aluno) => void; onDelete: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    name: aluno.name, email: aluno.email || "", phone: aluno.phone || "",
    status: aluno.status, source: aluno.source || "", planName: aluno.planName || "",
    planDetails: aluno.planDetails || "", paymentMethod: aluno.paymentMethod || "Pix",
    negotiationNotes: aluno.negotiationNotes || "", notes: aluno.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const health = financialHealth(aluno);
  const allInstallments = aluno.sales.flatMap(s => s.installments);
  const totalPago = allInstallments.filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0);
  const totalPendente = allInstallments.filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0);
  const vencidas = allInstallments.filter(i => i.status !== "pago" && new Date(i.dueDate) < new Date());
  const contrato = aluno.files?.find(f => f.category === "contrato");

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

  async function handleContractUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "contrato");
    const res = await fetch(`/api/alunos/${aluno.id}/arquivos`, { method: "POST", body: fd });
    const data = await res.json();
    onUpdate({ ...aluno, files: [...(aluno.files || []), data] });
    setUploading(false);
  }

  async function handleDelete() {
    if (!confirm(`Remover ${aluno.name}?`)) return;
    await fetch(`/api/alunos/${aluno.id}`, { method: "DELETE" });
    onDelete(aluno.id);
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "#6366f1" }}>
              {getInitials(aluno.name)}
            </div>
            <div>
              <p className="font-bold text-gray-900">{aluno.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg(aluno.status).color}`}>
                  {statusCfg(aluno.status).label.toUpperCase()}
                </span>
                {aluno.planName && <span className="text-[10px] text-gray-400">{aluno.planName}</span>}
                {health === "red"
                  ? <span className="text-[10px] text-red-500 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> {vencidas.length} vencida{vencidas.length > 1 ? "s" : ""}</span>
                  : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
              </div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {/* Informações */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase">Informações</span>
              <button onClick={() => setEditando(!editando)} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
                <Edit2 className="w-3 h-3" /> {editando ? "Cancelar" : "Editar"}
              </button>
            </div>

            {editando ? (
              <div className="space-y-2.5">
                <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="Telefone" className={inputCls} />
                  <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="Email" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.planName} onChange={e => set("planName", e.target.value)} className={inputCls}>
                    <option value="">Plano...</option>
                    {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <select value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)} className={inputCls}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {planNeedsDetails(form.planName) && (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <p className="text-xs font-semibold text-indigo-600 mb-1.5">
                      {form.planName === "Parceria/Collab" ? "Descreva a parceria / collab" : "Descreva o plano personalizado"}
                    </p>
                    <textarea rows={3} value={form.planDetails} onChange={e => set("planDetails", e.target.value)}
                      placeholder={form.planName === "Parceria/Collab"
                        ? "Ex: 3 meses grátis em troca de divulgação..."
                        : "Ex: 2x por semana online + 1x presencial..."}
                      className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white resize-none" />
                  </div>
                )}
                <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
                  <option value="">Funil...</option>
                  {FUNIL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <textarea rows={2} value={form.negotiationNotes} onChange={e => set("negotiationNotes", e.target.value)}
                  placeholder="Negociação..." className={`${inputCls} resize-none`} />
                <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="Observações..." className={`${inputCls} resize-none`} />
                <button onClick={handleSave} disabled={saving}
                  className="w-full py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: "#6366f1" }}>
                  <Save className="w-3.5 h-3.5" /> {saving ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                {aluno.phone && <p className="flex items-center gap-2 text-gray-700"><Phone className="w-3.5 h-3.5 text-gray-400" /> {aluno.phone}</p>}
                {aluno.email && <p className="flex items-center gap-2 text-gray-700"><Mail className="w-3.5 h-3.5 text-gray-400" /> {aluno.email}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {aluno.planName && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{aluno.planName}</span>}
                  {aluno.paymentMethod && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{aluno.paymentMethod}</span>}
                  {aluno.source && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">📍 {aluno.source}</span>}
                </div>
                {aluno.planDetails && planNeedsDetails(aluno.planName || "") && (
                  <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800">
                    <span className="font-bold">{aluno.planName === "Parceria/Collab" ? "Parceria:" : "Plano personalizado:"}</span> {aluno.planDetails}
                  </div>
                )}
                {aluno.negotiationNotes && (
                  <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
                    <span className="font-bold">Negociação:</span> {aluno.negotiationNotes}
                  </div>
                )}
                {aluno.notes && <p className="text-xs text-gray-500 italic mt-1">{aluno.notes}</p>}
                <p className="text-xs text-gray-400">Desde {fmtDate(aluno.createdAt)}</p>
              </div>
            )}
          </div>

          {/* Contrato */}
          <div className="p-5">
            <span className="text-[11px] font-bold text-gray-400 uppercase block mb-3">Contrato</span>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx"
              onChange={e => { if (e.target.files?.[0]) handleContractUpload(e.target.files[0]); }} />
            {contrato ? (
              <div className="flex items-center justify-between">
                <a href={contrato.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                  <FileText className="w-4 h-4" /> {contrato.name} <ExternalLink className="w-3 h-3" />
                </a>
                <button onClick={() => fileRef.current?.click()} className="text-xs text-gray-400 hover:text-gray-600">Substituir</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 w-full justify-center hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50">
                <Upload className="w-4 h-4" /> {uploading ? "Enviando..." : "Anexar contrato (PDF)"}
              </button>
            )}
          </div>

          {/* Financeiro */}
          <div className="p-5">
            <span className="text-[11px] font-bold text-gray-400 uppercase block mb-3">Financeiro</span>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-center">
                <p className="text-[10px] text-green-500 font-bold uppercase">Recebido</p>
                <p className="text-base font-bold text-green-700">{fmt(totalPago)}</p>
              </div>
              <div className={`rounded-xl p-3 border text-center ${vencidas.length > 0 ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <p className={`text-[10px] font-bold uppercase ${vencidas.length > 0 ? "text-red-500" : "text-amber-500"}`}>Pendente</p>
                <p className={`text-base font-bold ${vencidas.length > 0 ? "text-red-700" : "text-amber-700"}`}>{fmt(totalPendente)}</p>
              </div>
            </div>
            {aluno.sales.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">Nenhuma venda registrada</p>
              : aluno.sales.map(sale => (
                <div key={sale.id} className="mb-2 bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between mb-1.5">
                    <p className="text-sm font-semibold text-gray-800">{sale.description}</p>
                    <p className="text-xs font-bold text-gray-500">{fmt(sale.totalAmount)}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {sale.installments.map(inst => (
                      <span key={inst.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        inst.status === "pago" ? "bg-green-100 text-green-700"
                        : new Date(inst.dueDate) < new Date() ? "bg-red-100 text-red-600"
                        : "bg-gray-200 text-gray-500"
                      }`}>{fmt(inst.amount)}</span>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 shrink-0">
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
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterPlan, setFilterPlan] = useState("todos");
  const [filterFunil, setFilterFunil] = useState("todos");
  const [showNovo, setShowNovo] = useState(false);
  const [selected, setSelected] = useState<Aluno | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/alunos").then(r => r.json()),
      fetch("/api/configuracoes/planos").then(r => r.json()),
    ]).then(([alunosData, plansData]) => {
      setAlunos(Array.isArray(alunosData) ? alunosData : []);
      setPlans(Array.isArray(plansData) ? plansData : []);
      setLoading(false);
    });
  }, []);

  const allPlans = [...new Set(alunos.map(a => a.planName).filter(Boolean))] as string[];
  const allFunis = [...new Set(alunos.map(a => a.source).filter(Boolean))] as string[];

  const filtered = alunos.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = a.name.toLowerCase().includes(q) || (a.phone || "").includes(q) || (a.email || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "todos" || a.status === filterStatus;
    const matchPlan   = filterPlan   === "todos" || a.planName === filterPlan;
    const matchFunil  = filterFunil  === "todos" || a.source   === filterFunil;
    return matchSearch && matchStatus && matchPlan && matchFunil;
  });

  const ativos   = alunos.filter(a => a.status === "ativo").length;
  const leads    = alunos.filter(a => a.status === "lead").length;
  const criticos = alunos.filter(a => financialHealth(a) === "red").length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Alunos</h1>
            <p className="text-gray-400 text-sm mt-0.5">{alunos.length} cadastrados</p>
          </div>
          <button onClick={() => setShowNovo(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm" style={{ background: "#6366f1" }}>
            <Plus className="w-4 h-4" /> Novo Aluno
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { label: "Total", val: alunos.length, cls: "bg-gray-50 border-gray-200 text-gray-700" },
            { label: "Ativos", val: ativos, cls: "bg-green-50 border-green-200 text-green-700" },
            { label: "Leads", val: leads, cls: "bg-blue-50 border-blue-200 text-blue-700" },
            ...(criticos > 0 ? [{ label: "Inadimplentes", val: criticos, cls: "bg-red-50 border-red-200 text-red-700" }] : []),
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border text-sm font-semibold ${s.cls}`}>
              <span className="text-xs font-normal opacity-70">{s.label}</span>
              <span>{s.val}</span>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="flex gap-1">
            {["todos", "ativo", "lead", "pausado", "inativo"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === s ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
                style={filterStatus === s ? { background: "#6366f1" } : {}}>
                {s === "todos" ? "Todos" : statusCfg(s).label}
              </button>
            ))}
          </div>
          {allPlans.length > 0 && (
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-indigo-400 bg-white">
              <option value="todos">Todos os planos</option>
              {allPlans.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {allFunis.length > 0 && (
            <select value={filterFunil} onChange={e => setFilterFunil(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-indigo-400 bg-white">
              <option value="todos">Todos os funis</option>
              {allFunis.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-gray-400 text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <Users className="w-10 h-10 mb-2 text-gray-200" />
            <p className="text-sm">Nenhum aluno encontrado</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Aluno</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Plano</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Funil</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">Pagamento</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Situação</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Financeiro</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(aluno => {
                  const health = financialHealth(aluno);
                  const totalPago = aluno.sales.flatMap(s => s.installments).filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0);
                  const totalPendente = aluno.sales.flatMap(s => s.installments).filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0);
                  return (
                    <tr key={aluno.id} onClick={() => setSelected(aluno)}
                      className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: "#6366f1" }}>
                            {getInitials(aluno.name)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{aluno.name}</p>
                            {aluno.phone && <p className="text-xs text-gray-400">{aluno.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {aluno.planName
                          ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{aluno.planName}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {aluno.source
                          ? <span className="text-xs text-gray-500">{aluno.source}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-500">{aluno.paymentMethod || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg(aluno.status).color}`}>
                          {statusCfg(aluno.status).label.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs">
                          {totalPago > 0 && <p className="text-green-600 font-semibold">{fmt(totalPago)}</p>}
                          {totalPendente > 0 && (
                            <p className={`font-semibold ${health === "red" ? "text-red-500" : "text-amber-500"}`}>
                              {health === "red" && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                              {fmt(totalPendente)}
                            </p>
                          )}
                          {totalPago === 0 && totalPendente === 0 && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNovo && (
        <NovoAlunoModal plans={plans} onClose={() => setShowNovo(false)}
          onSave={a => { setAlunos(prev => [a, ...prev]); setShowNovo(false); }} />
      )}
      {selected && (
        <AlunoDrawer aluno={selected} plans={plans} onClose={() => setSelected(null)}
          onUpdate={a => { setAlunos(prev => prev.map(x => x.id === a.id ? a : x)); setSelected(a); }}
          onDelete={id => { setAlunos(prev => prev.filter(x => x.id !== id)); setSelected(null); }} />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Search, X, Trash2, Phone, Mail, Users, CheckCircle2,
  AlertTriangle, ChevronRight, DollarSign, Edit2, Save, Upload,
  ExternalLink, FileText, Filter, Download, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────
type Installment = { id: string; status: string; dueDate: string; amount: number; number: number };
type Sale = { id: string; description: string; totalAmount: number; installmentsCount: number; paymentMethod?: string | null; installments: Installment[] };
type StudentFile = { id: string; name: string; url: string; category: string; fileType: string };
type Aluno = {
  id: string; name: string; email?: string | null; phone?: string | null;
  notes?: string | null; status: string; source?: string | null;
  planName?: string | null; planDetails?: string | null;
  paymentMethod?: string | null; negotiationNotes?: string | null;
  contractUrl?: string | null; tags: string[]; createdAt: string;
  sales: Sale[]; files: StudentFile[];
};

// ─── Constants ────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "ativo",   label: "Ativo",   color: "bg-green-100 text-green-700" },
  { value: "inativo", label: "Inativo", color: "bg-gray-100 text-gray-500" },
  { value: "lead",    label: "Lead",    color: "bg-blue-100 text-blue-600" },
  { value: "pausado", label: "Pausado", color: "bg-amber-100 text-amber-600" },
];
const PLAN_OPTIONS = [
  { value: "Trimestral",      label: "Trimestral",       details: false },
  { value: "Semestral",       label: "Semestral",        details: false },
  { value: "Anual",           label: "Anual",            details: false },
  { value: "Personalizado",   label: "Personalizado",    details: true  },
  { value: "Parceria/Collab", label: "Parceria / Collab", details: true },
];
const FUNIL_OPTIONS = ["Instagram", "Indicação", "WhatsApp", "TikTok", "Google", "Site", "Evento", "Outro"];
const PAYMENT_METHODS = ["Pix", "Débito", "Crédito", "Transferência", "Boleto", "Dinheiro"];

function statusCfg(s: string) { return STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0]; }
function planNeedsDetails(p: string) { return PLAN_OPTIONS.find(o => o.value === p)?.details ?? false; }
function getInitials(n: string) { return n.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
function fmt(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR").format(dt);
}
function financialHealth(a: Aluno): "green" | "red" {
  return a.sales.flatMap(s => s.installments).some(i => i.status !== "pago" && new Date(i.dueDate) < new Date()) ? "red" : "green";
}
function totalPago(a: Aluno) { return a.sales.flatMap(s => s.installments).filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0); }
function totalPendente(a: Aluno) { return a.sales.flatMap(s => s.installments).filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0); }

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white";

// ─── PlanDetailsCard ──────────────────────────────────────────────
function PlanDetailsCard({ planName, value, set }: { planName: string; value: string; set: (v: string) => void }) {
  if (!planNeedsDetails(planName)) return null;
  return (
    <div className="col-span-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
      <p className="text-xs font-bold text-indigo-600 mb-1.5">
        {planName === "Parceria/Collab" ? "Descreva a parceria / collab" : "Descreva o plano personalizado"}
      </p>
      <textarea rows={2} value={value} onChange={e => set(e.target.value)}
        placeholder={planName === "Parceria/Collab" ? "Ex: 3 meses grátis em troca de divulgação..." : "Ex: 2x por semana online + 1x presencial..."}
        className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white resize-none" />
    </div>
  );
}

// ─── Modal Novo Aluno ─────────────────────────────────────────────
function NovoAlunoModal({ onClose, onSave }: { onClose: () => void; onSave: (a: Aluno) => void }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", status: "ativo", source: "",
    planName: "", planDetails: "", paymentMethod: "Pix",
    negotiationNotes: "", notes: "",
    totalAmount: "", installments: "1", firstDueDate: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const total = parseFloat(form.totalAmount.replace(",", ".")) || 0;
  const count = parseInt(form.installments) || 1;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    const res = await fetch("/api/alunos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, totalAmount: total, installments: count }),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Novo Aluno</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSave} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">

            {/* Coluna 1 — Dados pessoais */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Dados pessoais</p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nome *</label>
                <input required autoFocus value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Telefone</label>
                <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(55) 99999-9999" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@exemplo.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">De qual funil veio?</label>
                <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {FUNIL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Observações</label>
                <textarea rows={3} value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="Notas gerais..." className={`${inputCls} resize-none`} />
              </div>
            </div>

            {/* Coluna 2 — Plano & Financeiro */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Plano & Financeiro</p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Plano</label>
                <select value={form.planName} onChange={e => set("planName", e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {planNeedsDetails(form.planName) && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <p className="text-xs font-bold text-indigo-600 mb-1.5">
                    {form.planName === "Parceria/Collab" ? "Descreva a parceria / collab" : "Descreva o plano personalizado"}
                  </p>
                  <textarea rows={2} value={form.planDetails} onChange={e => set("planDetails", e.target.value)}
                    placeholder={form.planName === "Parceria/Collab" ? "Ex: 3 meses grátis em troca de divulgação..." : "Ex: 2x por semana online + 1x presencial..."}
                    className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white resize-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Forma de Pagamento</label>
                <select value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)} className={inputCls}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Financeiro */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase">Gerar lançamento financeiro</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Valor total (R$)</label>
                  <input value={form.totalAmount} onChange={e => set("totalAmount", e.target.value)}
                    placeholder="0,00" type="number" step="0.01" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Parcelas</label>
                    <input value={form.installments} onChange={e => set("installments", e.target.value)}
                      type="number" min="1" max="60" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">1ª parcela em</label>
                    <input type="date" value={form.firstDueDate} onChange={e => set("firstDueDate", e.target.value)} className={inputCls} />
                  </div>
                </div>
                {total > 0 && (
                  <div className="text-xs text-indigo-600 font-semibold bg-indigo-50 rounded-lg px-3 py-2">
                    {count}x de {fmt(total / count)} = {fmt(total)}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Negociação</label>
                <textarea rows={2} value={form.negotiationNotes} onChange={e => set("negotiationNotes", e.target.value)}
                  placeholder="Condições especiais, descontos..." className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#6366f1" }}>
              {saving ? "Salvando..." : "Cadastrar aluno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Importar ───────────────────────────────────────────────
function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (alunos: Aluno[]) => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      setRows(json.slice(0, 200));
    };
    reader.readAsArrayBuffer(file);
  }

  function mapRow(r: Record<string, string>) {
    const get = (...keys: string[]) => keys.map(k => r[k] || r[k.toLowerCase()] || r[k.toUpperCase()] || "").find(v => v) || "";
    return {
      name:          get("Nome", "name", "NOME", "nome completo"),
      phone:         get("Telefone", "phone", "Celular", "TELEFONE"),
      email:         get("Email", "email", "E-mail", "EMAIL"),
      status:        get("Status", "status") || "ativo",
      planName:      get("Plano", "plan", "PLANO"),
      paymentMethod: get("Pagamento", "Forma de Pagamento", "payment"),
      source:        get("Funil", "Origem", "source"),
      notes:         get("Observações", "Obs", "notes"),
    };
  }

  async function handleImport() {
    setImporting(true);
    const res = await fetch("/api/alunos", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alunos: rows.map(mapRow) }),
    });
    const data = await res.json();
    setDone(true);
    setImporting(false);
    if (data.ok) {
      setTimeout(() => { onImport([]); }, 1500);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nome", "Telefone", "Email", "Status", "Plano", "Pagamento", "Funil", "Observações"],
      ["João Silva", "55 99999-9999", "joao@email.com", "ativo", "Semestral", "Pix", "Instagram", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, "template-alunos.xlsx");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Importar Alunos</h2>
            <p className="text-xs text-gray-400 mt-0.5">CSV ou Excel (.xlsx) — até 200 alunos por vez</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {done ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-lg font-bold text-gray-800">Importação concluída!</p>
              <p className="text-sm text-gray-400">{rows.length} alunos importados</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="space-y-4">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center bg-gray-50 hover:border-indigo-300 transition-colors">
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-3">Arraste o arquivo aqui ou clique para selecionar</p>
                <label className="cursor-pointer px-5 py-2 rounded-lg text-sm font-medium text-white inline-block" style={{ background: "#6366f1" }}>
                  Selecionar arquivo
                  <input type="file" className="hidden" accept=".csv,.xlsx,.xls"
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </label>
              </div>
              <button onClick={downloadTemplate}
                className="flex items-center gap-2 text-xs text-indigo-600 hover:underline mx-auto">
                <Download className="w-3.5 h-3.5" /> Baixar template de importação
              </button>
              <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                <p className="font-semibold mb-1">Colunas reconhecidas automaticamente:</p>
                <p>Nome, Telefone, Email, Status, Plano, Pagamento, Funil, Observações</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">{rows.length} alunos encontrados</p>
                <button onClick={() => setRows([])} className="text-xs text-gray-400 hover:text-gray-600">Trocar arquivo</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {["Nome", "Telefone", "Email", "Status", "Plano", "Funil"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => {
                      const m = mapRow(r);
                      return (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{m.name || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-gray-500">{m.phone || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{m.email || "—"}</td>
                          <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusCfg(m.status).color}`}>{statusCfg(m.status).label}</span></td>
                          <td className="px-3 py-2 text-gray-500">{m.planName || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{m.source || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 10 && <p className="text-xs text-gray-400 text-center py-2">+{rows.length - 10} mais...</p>}
              </div>
            </div>
          )}
        </div>

        {!done && rows.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2 shrink-0">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleImport} disabled={importing}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#6366f1" }}>
              {importing ? "Importando..." : `Importar ${rows.length} alunos`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Drawer Detalhe ───────────────────────────────────────────────
function AlunoDrawer({ aluno, onClose, onUpdate, onDelete }: {
  aluno: Aluno; onClose: () => void; onUpdate: (a: Aluno) => void; onDelete: (id: string) => void;
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
  const [uploadError, setUploadError] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({
    description: aluno.planName || "Plano",
    totalAmount: "", installments: "1",
    firstDueDate: new Date().toISOString().slice(0, 10),
    paymentMethod: aluno.paymentMethod || "Pix",
  });
  const [savingPay, setSavingPay] = useState(false);
  const [sales, setSales] = useState<Sale[]>(aluno.sales);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setPay = (k: string, v: string) => setPayForm(f => ({ ...f, [k]: v }));

  const allInstallments = sales.flatMap(s => s.installments);
  const pago = allInstallments.filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0);
  const pendente = allInstallments.filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0);
  const vencidas = allInstallments.filter(i => i.status !== "pago" && new Date(i.dueDate) < new Date());
  const health: "green" | "red" = vencidas.length > 0 ? "red" : "green";
  const contrato = aluno.files?.find(f => f.category === "contrato");
  const payTotal = parseFloat(payForm.totalAmount.replace(",", ".")) || 0;
  const payCount = parseInt(payForm.installments) || 1;

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

  async function handleAddPayment() {
    if (!payTotal) return;
    setSavingPay(true);
    const res = await fetch("/api/financeiro/vendas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId:          aluno.id,
        description:       payForm.description,
        totalAmount:       payTotal,
        installmentsCount: payCount,
        paymentMethod:     payForm.paymentMethod,
        firstDueDate:      payForm.firstDueDate,
      }),
    });
    const newSale = await res.json();
    setSales(prev => [newSale, ...prev]);
    setShowPayForm(false);
    setPayForm(f => ({ ...f, totalAmount: "", installments: "1" }));
    setSavingPay(false);
  }

  async function toggleInstallment(saleId: string, instId: string, currentStatus: string) {
    const newStatus = currentStatus === "pago" ? "pendente" : "pago";
    const res = await fetch(`/api/financeiro/vendas/${saleId}/parcelas/${instId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const updated = await res.json();
    setSales(prev => prev.map(s => s.id === saleId
      ? { ...s, installments: s.installments.map(i => i.id === instId ? { ...i, ...updated } : i) }
      : s
    ));
  }

  async function handleContractUpload(file: File) {
    setUploading(true);
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "contrato");
    const res = await fetch(`/api/alunos/${aluno.id}/arquivos`, { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) { setUploadError(data.error); setUploading(false); return; }
    onUpdate({ ...aluno, files: [...(aluno.files || []).filter(f => f.category !== "contrato"), data] });
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
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: "#6366f1" }}>
              {getInitials(aluno.name)}
            </div>
            <div>
              <p className="font-bold text-gray-900">{aluno.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg(aluno.status).color}`}>{statusCfg(aluno.status).label.toUpperCase()}</span>
                {aluno.planName && <span className="text-[10px] text-gray-500">{aluno.planName}</span>}
                {health === "red"
                  ? <span className="text-[10px] text-red-500 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{vencidas.length} vencida{vencidas.length > 1 ? "s" : ""}</span>
                  : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
              </div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {/* Info */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase">Informações</span>
              <button onClick={() => setEditando(!editando)} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
                <Edit2 className="w-3 h-3" /> {editando ? "Cancelar" : "Editar"}
              </button>
            </div>

            {editando ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome" className={inputCls} />
                </div>
                <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="Telefone" className={inputCls} />
                <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <div className="col-span-2">
                  <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="Email" className={inputCls} />
                </div>
                <select value={form.planName} onChange={e => set("planName", e.target.value)} className={inputCls}>
                  <option value="">Plano...</option>
                  {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)} className={inputCls}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <PlanDetailsCard planName={form.planName} value={form.planDetails} set={v => set("planDetails", v)} />
                <select value={form.source} onChange={e => set("source", e.target.value)} className={`${inputCls} col-span-2`}>
                  <option value="">Funil...</option>
                  {FUNIL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <textarea rows={2} value={form.negotiationNotes} onChange={e => set("negotiationNotes", e.target.value)}
                  placeholder="Negociação..." className={`${inputCls} resize-none col-span-2`} />
                <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="Observações..." className={`${inputCls} resize-none col-span-2`} />
                <button onClick={handleSave} disabled={saving}
                  className="col-span-2 py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: "#6366f1" }}>
                  <Save className="w-3.5 h-3.5" /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {aluno.phone && <div className="flex items-center gap-1.5 text-gray-700"><Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />{aluno.phone}</div>}
                {aluno.email && <div className="flex items-center gap-1.5 text-gray-700 truncate"><Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="truncate">{aluno.email}</span></div>}
                <div className="col-span-2 flex flex-wrap gap-1.5 mt-1">
                  {aluno.planName && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{aluno.planName}</span>}
                  {aluno.paymentMethod && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{aluno.paymentMethod}</span>}
                  {aluno.source && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">📍 {aluno.source}</span>}
                </div>
                {aluno.planDetails && planNeedsDetails(aluno.planName || "") && (
                  <div className="col-span-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800">
                    <span className="font-bold">{aluno.planName === "Parceria/Collab" ? "Parceria:" : "Personalizado:"}</span> {aluno.planDetails}
                  </div>
                )}
                {aluno.negotiationNotes && (
                  <div className="col-span-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
                    <span className="font-bold">Negociação:</span> {aluno.negotiationNotes}
                  </div>
                )}
                {aluno.notes && <p className="col-span-2 text-xs text-gray-500 italic">{aluno.notes}</p>}
                <p className="col-span-2 text-xs text-gray-400">Desde {fmtDate(aluno.createdAt)}</p>
              </div>
            )}
          </div>

          {/* Contrato */}
          <div className="px-5 py-4">
            <span className="text-[11px] font-bold text-gray-400 uppercase block mb-3">Contrato</span>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx"
              onChange={e => { if (e.target.files?.[0]) handleContractUpload(e.target.files[0]); }} />
            {contrato ? (
              <div className="flex items-center justify-between">
                {contrato.url.startsWith("data:") ? (
                  <a href={contrato.url} download={contrato.name}
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                    <FileText className="w-4 h-4" /> {contrato.name} <Download className="w-3 h-3" />
                  </a>
                ) : (
                  <a href={contrato.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                    <FileText className="w-4 h-4" /> {contrato.name} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button onClick={() => fileRef.current?.click()} className="text-xs text-gray-400 hover:text-gray-600">Substituir</button>
              </div>
            ) : (
              <div>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 w-full justify-center hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50">
                  <Upload className="w-4 h-4" /> {uploading ? "Enviando..." : "Anexar contrato (PDF)"}
                </button>
                {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
              </div>
            )}
          </div>

          {/* Financeiro */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase">Financeiro</span>
              <button onClick={() => setShowPayForm(v => !v)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <Plus className="w-3 h-3" /> {showPayForm ? "Cancelar" : "Registrar pagamento"}
              </button>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-center">
                <p className="text-[10px] text-green-500 font-bold uppercase">Recebido</p>
                <p className="text-base font-bold text-green-700">{fmt(pago)}</p>
              </div>
              <div className={`rounded-xl p-3 border text-center ${vencidas.length > 0 ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <p className={`text-[10px] font-bold uppercase ${vencidas.length > 0 ? "text-red-500" : "text-amber-500"}`}>Pendente</p>
                <p className={`text-base font-bold ${vencidas.length > 0 ? "text-red-700" : "text-amber-700"}`}>{fmt(pendente)}</p>
              </div>
            </div>

            {/* Formulário novo pagamento */}
            {showPayForm && (
              <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
                <p className="text-xs font-bold text-indigo-700">Novo lançamento financeiro</p>
                <input value={payForm.description} onChange={e => setPay("description", e.target.value)}
                  placeholder="Descrição (ex: Plano Semestral)" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Valor total (R$)</label>
                    <input value={payForm.totalAmount} onChange={e => setPay("totalAmount", e.target.value)}
                      placeholder="0,00" type="number" step="0.01" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Parcelas</label>
                    <input value={payForm.installments} onChange={e => setPay("installments", e.target.value)}
                      type="number" min="1" max="60" className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">1ª parcela em</label>
                    <input type="date" value={payForm.firstDueDate} onChange={e => setPay("firstDueDate", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Pagamento</label>
                    <select value={payForm.paymentMethod} onChange={e => setPay("paymentMethod", e.target.value)} className={inputCls}>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                {payTotal > 0 && (
                  <p className="text-xs text-indigo-600 font-semibold">
                    {payCount}x de {fmt(payTotal / payCount)} = {fmt(payTotal)}
                  </p>
                )}
                <button onClick={handleAddPayment} disabled={savingPay || !payTotal}
                  className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#6366f1" }}>
                  {savingPay ? "Salvando..." : "Salvar e enviar ao Financeiro"}
                </button>
              </div>
            )}

            {/* Lista de vendas */}
            {sales.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">Nenhum lançamento registrado</p>
              : sales.map(sale => {
                const pagas = sale.installments.filter(i => i.status === "pago").length;
                return (
                  <div key={sale.id} className="mb-3 bg-gray-50 rounded-xl p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{sale.description}</p>
                        <p className="text-xs text-gray-400">{sale.paymentMethod} · {pagas}/{sale.installmentsCount} pagas</p>
                      </div>
                      <p className="text-sm font-bold text-gray-600">{fmt(sale.totalAmount)}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {sale.installments.sort((a, b) => a.number - b.number).map(inst => {
                        const isPago = inst.status === "pago";
                        const isVencida = !isPago && new Date(inst.dueDate) < new Date();
                        return (
                          <button key={inst.id}
                            onClick={() => toggleInstallment(sale.id, inst.id, inst.status)}
                            title={`Parcela ${inst.number} — ${fmtDate(inst.dueDate)} — clique para ${isPago ? "desmarcar" : "marcar como paga"}`}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-all hover:scale-105 ${
                              isPago ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : isVencida ? "bg-red-100 text-red-600 hover:bg-red-200"
                              : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                            }`}>
                            {inst.number}x {fmt(inst.amount)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Clique na parcela para marcar como paga</p>
                  </div>
                );
              })
            }
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button onClick={handleDelete}
            className="w-full py-2 rounded-xl text-sm text-red-500 border border-red-200 hover:bg-red-50 flex items-center justify-center gap-1">
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
  const [filterPlan, setFilterPlan] = useState("todos");
  const [filterFunil, setFilterFunil] = useState("todos");
  const [showFilters, setShowFilters] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Aluno | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/alunos").then(r => r.json()).then(data => {
      setAlunos(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const allPlans = [...new Set(alunos.map(a => a.planName).filter(Boolean))] as string[];
  const allFunis = [...new Set(alunos.map(a => a.source).filter(Boolean))] as string[];

  const filtered = alunos.filter(a => {
    const q = search.toLowerCase();
    return (
      (a.name.toLowerCase().includes(q) || (a.phone || "").includes(q) || (a.email || "").toLowerCase().includes(q)) &&
      (filterStatus === "todos" || a.status === filterStatus) &&
      (filterPlan   === "todos" || a.planName === filterPlan) &&
      (filterFunil  === "todos" || a.source   === filterFunil)
    );
  });

  const ativos   = alunos.filter(a => a.status === "ativo").length;
  const leads    = alunos.filter(a => a.status === "lead").length;
  const criticos = alunos.filter(a => financialHealth(a) === "red").length;
  const hasFilters = filterStatus !== "todos" || filterPlan !== "todos" || filterFunil !== "todos";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Alunos</h1>
            <p className="text-gray-400 text-sm mt-0.5">{alunos.length} cadastrados</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
              <Upload className="w-4 h-4" /> Importar
            </button>
            <button onClick={() => setShowNovo(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm" style={{ background: "#6366f1" }}>
              <Plus className="w-4 h-4" /> Novo Aluno
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { label: "Total", val: alunos.length, cls: "bg-gray-50 border-gray-200 text-gray-700" },
            { label: "Ativos", val: ativos, cls: "bg-green-50 border-green-200 text-green-700" },
            { label: "Leads", val: leads, cls: "bg-blue-50 border-blue-200 text-blue-700" },
            ...(criticos > 0 ? [{ label: "Inadimplentes", val: criticos, cls: "bg-red-50 border-red-200 text-red-600" }] : []),
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border text-sm ${s.cls}`}>
              <span className="text-xs font-normal opacity-60">{s.label}</span>
              <span className="font-bold">{s.val}</span>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou email..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-400" />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`p-2 rounded-xl border transition-colors relative ${showFilters || hasFilters ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            <Filter className="w-4 h-4" />
            {hasFilters && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
          </button>
          <button onClick={load} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-wrap gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Status</p>
              <div className="flex gap-1">
                {["todos", "ativo", "lead", "pausado", "inativo"].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${filterStatus === s ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
                    style={filterStatus === s ? { background: "#6366f1" } : {}}>
                    {s === "todos" ? "Todos" : statusCfg(s).label}
                  </button>
                ))}
              </div>
            </div>
            {allPlans.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Plano</p>
                <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="todos">Todos os planos</option>
                  {allPlans.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            {allFunis.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Funil</p>
                <select value={filterFunil} onChange={e => setFilterFunil(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="todos">Todos os funis</option>
                  {allFunis.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
            {hasFilters && (
              <button onClick={() => { setFilterStatus("todos"); setFilterPlan("todos"); setFilterFunil("todos"); }}
                className="text-xs text-red-500 hover:underline self-end">Limpar filtros</button>
            )}
          </div>
        )}
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
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Aluno</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Plano</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase hidden md:table-cell">Funil</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase hidden lg:table-cell">Pagamento</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase">Financeiro</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(aluno => {
                  const health = financialHealth(aluno);
                  const pago = totalPago(aluno);
                  const pendente = totalPendente(aluno);
                  return (
                    <tr key={aluno.id} onClick={() => setSelected(aluno)}
                      className="border-t border-gray-50 hover:bg-indigo-50/30 cursor-pointer group transition-colors">
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
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">{aluno.source || "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">{aluno.paymentMethod || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg(aluno.status).color}`}>
                          {statusCfg(aluno.status).label.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs space-y-0.5">
                          {pago > 0 && <p className="text-green-600 font-semibold flex items-center justify-end gap-0.5"><DollarSign className="w-3 h-3" />{fmt(pago)}</p>}
                          {pendente > 0 && (
                            <p className={`font-semibold flex items-center justify-end gap-0.5 ${health === "red" ? "text-red-500" : "text-amber-500"}`}>
                              {health === "red" && <AlertTriangle className="w-3 h-3" />}{fmt(pendente)}
                            </p>
                          )}
                          {pago === 0 && pendente === 0 && <span className="text-gray-300">—</span>}
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
            <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/50">
              <p className="text-xs text-gray-400">{filtered.length} aluno{filtered.length !== 1 ? "s" : ""} · ordem alfabética</p>
            </div>
          </div>
        )}
      </div>

      {showNovo && <NovoAlunoModal onClose={() => setShowNovo(false)} onSave={a => { setAlunos(prev => [...prev, a].sort((a, b) => a.name.localeCompare(b.name))); setShowNovo(false); }} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={() => { setShowImport(false); load(); }} />}
      {selected && (
        <AlunoDrawer aluno={selected} onClose={() => setSelected(null)}
          onUpdate={a => { setAlunos(prev => prev.map(x => x.id === a.id ? a : x)); setSelected(a); }}
          onDelete={id => { setAlunos(prev => prev.filter(x => x.id !== id)); setSelected(null); }} />
      )}
    </div>
  );
}

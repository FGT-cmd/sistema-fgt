"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, Search, Dumbbell, CheckCircle2, AlertTriangle, XCircle,
  X, Upload, Trash2, Download, FileText, Image, File, Phone, Mail,
  ChevronRight, Users, Activity, Paperclip, CreditCard, ChevronLeft,
} from "lucide-react";

type StudentFile = {
  id: string;
  name: string;
  url: string;
  fileType: string;
  category: string;
  size?: number;
  createdAt: string;
};

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  status: string;
  createdAt: string;
  checkIns: { id: string; respondedAt?: string; createdAt: string }[];
  sales: { id: string; installments: { id: string; status: string; dueDate: string }[] }[];
  anamnese?: { id: string } | null;
  workoutPlans: { id: string; name: string; active: boolean }[];
  bodyRecords: { id: string; date: string; weight?: number }[];
  files?: StudentFile[];
};

const healthIcon = {
  green: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  yellow: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  red: <XCircle className="w-4 h-4 text-red-500" />,
};
const healthLabel = { green: "Em dia", yellow: "Atenção", red: "Crítico" };
const healthBg = { green: "#ecfdf5", yellow: "#fffbeb", red: "#fef2f2" };

function getHealth(client: Client): "green" | "yellow" | "red" {
  const pendingInstallments = client.sales.flatMap((s) => s.installments).filter((i) => {
    if (i.status !== "pendente") return false;
    return new Date(i.dueDate) < new Date();
  });
  if (pendingInstallments.length > 0) return "red";
  const lastCheckin = client.checkIns[0];
  if (!lastCheckin) return "yellow";
  const daysSince = (Date.now() - new Date(lastCheckin.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 14) return "yellow";
  return "green";
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(dt);
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <Image className="w-5 h-5 text-blue-500" />;
  if (type === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
}

const FILE_CATEGORIES = ["contrato", "exame", "foto", "anamnese", "outro"];
const PAYMENT_METHODS = ["Pix", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Transferência", "Dinheiro"];

type ServicePlan = { id: string; name: string; description?: string | null; totalAmount: number; installments: number; durationMonths: number };

// ─── Novo Aluno modal (2 passos) ─────────────────────────────────
function NewStudentModal({ onClose, onSave }: { onClose: () => void; onSave: (c: Client) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm]   = useState({ name: "", email: "", phone: "", notes: "" });
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [payment, setPayment] = useState({
    description: "", totalAmount: "", installments: "1",
    paymentMethod: "", firstDueDate: new Date().toISOString().split("T")[0],
  });
  const [withPayment, setWithPayment] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/planos")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function applyPlan(planId: string) {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setPayment((prev) => ({
      ...prev,
      description:   plan.name,
      totalAmount:   String(plan.totalAmount),
      installments:  String(plan.installments),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const body: Record<string, unknown> = { ...form };
    if (withPayment && payment.totalAmount && parseFloat(payment.totalAmount) > 0) {
      body.payment = {
        description:   payment.description || form.name,
        totalAmount:   parseFloat(payment.totalAmount),
        installments:  parseInt(payment.installments) || 1,
        paymentMethod: payment.paymentMethod || null,
        firstDueDate:  payment.firstDueDate,
      };
    }
    const res  = await fetch("/api/alunos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    onSave({ ...data, checkIns: data.checkIns ?? [], sales: data.sales ?? [], workoutPlans: data.workoutPlans ?? [], bodyRecords: data.bodyRecords ?? [], files: [] });
    setSaving(false);
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900">
              {step === 1 ? "Novo Aluno" : "Plano e Pagamento"}
            </h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Indicador de passos */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={step >= s ? { background: "#6366f1", color: "#fff" } : { background: "#e5e7eb", color: "#9ca3af" }}
              >
                {s}
              </div>
              {s < 2 && <div className="h-px w-8" style={{ background: step > s ? "#6366f1" : "#e5e7eb" }} />}
            </div>
          ))}
          <span className="text-xs text-gray-400 ml-1">{step === 1 ? "Dados básicos" : "Pagamento"}</span>
        </div>

        {/* Passo 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancelar</button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => { if (!form.name.trim()) return; setSaving(true); const res = await fetch("/api/alunos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await res.json(); onSave({ ...data, checkIns: [], sales: [], workoutPlans: [], bodyRecords: [], files: [] }); setSaving(false); }}
                  disabled={!form.name.trim() || saving}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                >
                  Salvar sem plano
                </button>
                <button
                  type="button"
                  onClick={() => { if (!form.name.trim()) return; setStep(2); }}
                  disabled={!form.name.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-40"
                  style={{ background: "#6366f1" }}
                >
                  Próximo: Pagamento
                  <CreditCard className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Passo 2 */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Toggle incluir pagamento */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setWithPayment((v) => !v)}
                className="w-10 h-5 rounded-full relative transition-colors cursor-pointer"
                style={{ background: withPayment ? "#6366f1" : "#d1d5db" }}
              >
                <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm" style={{ left: withPayment ? "22px" : "2px" }} />
              </div>
              <span className="text-sm font-medium text-gray-700">Registrar pagamento agora</span>
            </label>

            {withPayment && (
              <>
                {/* Planos pré-configurados */}
                {plans.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Usar plano pré-configurado</label>
                    <select value={selectedPlanId} onChange={(e) => applyPlan(e.target.value)} className={inputCls}>
                      <option value="">Selecionar plano...</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — R$ {p.totalAmount.toFixed(2)} / {p.installments}x</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Detalhes do pagamento</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do plano</label>
                      <input value={payment.description} onChange={(e) => setPayment((p) => ({ ...p, description: e.target.value }))} placeholder="Ex: Consultoria 3 meses" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor total (R$)</label>
                        <input type="number" value={payment.totalAmount} onChange={(e) => setPayment((p) => ({ ...p, totalAmount: e.target.value }))} placeholder="0,00" className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parcelas</label>
                        <input type="number" min="1" value={payment.installments} onChange={(e) => setPayment((p) => ({ ...p, installments: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                        <select value={payment.paymentMethod} onChange={(e) => setPayment((p) => ({ ...p, paymentMethod: e.target.value }))} className={inputCls}>
                          <option value="">Selecionar...</option>
                          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data da 1ª parcela</label>
                        <input type="date" value={payment.firstDueDate} onChange={(e) => setPayment((p) => ({ ...p, firstDueDate: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    {payment.totalAmount && parseInt(payment.installments) > 1 && (
                      <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700">
                        {payment.installments}x de R$ {(parseFloat(payment.totalAmount) / parseInt(payment.installments)).toFixed(2)} — Total: R$ {parseFloat(payment.totalAmount).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Voltar</button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#6366f1" }}
              >
                {saving ? "Salvando..." : "Cadastrar aluno"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Arquivos tab ────────────────────────────────────────────────
function FilesTab({ clientId }: { clientId: string }) {
  const [files, setFiles] = useState<StudentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("outro");
  const [filter, setFilter] = useState("todos");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/alunos/${clientId}/arquivos`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setFiles(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    const res = await fetch(`/api/alunos/${clientId}/arquivos`, { method: "POST", body: fd });
    const data = await res.json();
    setFiles((prev) => [data, ...prev]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(fileId: string) {
    if (!confirm("Remover este arquivo?")) return;
    await fetch(`/api/alunos/${clientId}/arquivos?fileId=${fileId}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  const filtered = filter === "todos" ? files : files.filter((f) => f.category === filter);

  if (loading) return <div className="py-10 text-center text-gray-400 text-sm">Carregando...</div>;

  return (
    <div>
      {/* Upload area */}
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 mb-5 text-center bg-gray-50">
        <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">Arraste ou selecione um arquivo</p>
        <div className="flex items-center justify-center gap-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white capitalize">
            {FILE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <label className="cursor-pointer px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: "#6366f1" }}>
            {uploading ? "Enviando..." : "Selecionar arquivo"}
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {["todos", ...FILE_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${filter === c ? "text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
            style={filter === c ? { background: "#6366f1" } : {}}>
            {c === "todos" ? "Todos" : c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      {/* File list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhum arquivo nesta categoria
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
              <FileIcon type={file.fileType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">
                  <span className="capitalize bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded mr-2">{file.category}</span>
                  {formatDate(file.createdAt)}{file.size ? ` · ${formatBytes(file.size)}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <a href={file.url} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                  <Download className="w-4 h-4" />
                </a>
                <button onClick={() => handleDelete(file.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Perfil tab ──────────────────────────────────────────────────
function PerfilTab({ client, onUpdate }: { client: Client; onUpdate: (c: Client) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: client.name, email: client.email || "", phone: client.phone || "", notes: client.notes || "" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/alunos/${client.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json();
    onUpdate({ ...client, ...data });
    setEditing(false);
    setSaving(false);
  }

  const pendingInstallments = client.sales.flatMap((s) => s.installments).filter((i) => i.status === "pendente");
  const overdueInstallments = pendingInstallments.filter((i) => new Date(i.dueDate) < new Date());

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-700">{client.checkIns.length}</p>
          <p className="text-xs text-indigo-500 mt-1">Check-ins</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{client.workoutPlans.length}</p>
          <p className="text-xs text-green-500 mt-1">Treinos</p>
        </div>
        <div className={`rounded-xl p-4 text-center ${overdueInstallments.length > 0 ? "bg-red-50" : "bg-gray-50"}`}>
          <p className={`text-2xl font-bold ${overdueInstallments.length > 0 ? "text-red-600" : "text-gray-600"}`}>{overdueInstallments.length}</p>
          <p className={`text-xs mt-1 ${overdueInstallments.length > 0 ? "text-red-400" : "text-gray-400"}`}>Faturas vencidas</p>
        </div>
      </div>

      {/* Info */}
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Observações</label>
            <textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: "#6366f1" }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          {client.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4 text-gray-400" /> {client.email}
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4 text-gray-400" /> {client.phone}
            </div>
          )}
          {client.notes && <p className="text-sm text-gray-600 border-t border-gray-100 pt-3">{client.notes}</p>}
          <button onClick={() => setEditing(true)} className="text-xs text-indigo-600 hover:underline">Editar informações</button>
        </div>
      )}

      {/* Body records */}
      {client.bodyRecords.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Última evolução</p>
          <div className="bg-gray-50 rounded-xl p-4 flex gap-6">
            {client.bodyRecords[0].weight && (
              <div>
                <p className="text-xs text-gray-400">Peso</p>
                <p className="text-lg font-bold text-gray-800">{client.bodyRecords[0].weight} kg</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Data</p>
              <p className="text-sm font-medium text-gray-700">{formatDate(client.bodyRecords[0].date)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Active workout plan */}
      {client.workoutPlans.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Plano de treino ativo</p>
          <div className="bg-indigo-50 rounded-xl p-4">
            <p className="text-sm font-medium text-indigo-800">{client.workoutPlans[0].name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Student detail modal ────────────────────────────────────────
type DetailTab = "perfil" | "arquivos" | "checkins";

function StudentDetailModal({ client, onClose, onUpdate }: {
  client: Client;
  onClose: () => void;
  onUpdate: (c: Client) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("perfil");
  const health = getHealth(client);

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "perfil", label: "Perfil" },
    { key: "arquivos", label: "Arquivos" },
    { key: "checkins", label: "Check-ins" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-5 border-b border-gray-100">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0" style={{ background: "#6366f1" }}>
            {getInitials(client.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{client.name}</h2>
            <div className="flex items-center gap-1 mt-0.5">
              {healthIcon[health]}
              <span className={`text-xs font-medium ${health === "green" ? "text-green-600" : health === "yellow" ? "text-amber-600" : "text-red-600"}`}>
                {healthLabel[health]}
              </span>
              <span className="text-gray-300 mx-1">·</span>
              <span className="text-xs text-gray-400">Desde {formatDate(client.createdAt)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "perfil" && <PerfilTab client={client} onUpdate={onUpdate} />}
          {tab === "arquivos" && <FilesTab clientId={client.id} />}
          {tab === "checkins" && (
            <div>
              {client.checkIns.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhum check-in registrado
                </div>
              ) : (
                <div className="space-y-3">
                  {client.checkIns.map((ci) => (
                    <div key={ci.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-sm font-medium text-gray-700">{formatDate(ci.createdAt)}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {ci.respondedAt ? `Respondido em ${formatDate(ci.respondedAt)}` : "Sem resposta"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────
export default function AlunosPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "green" | "yellow" | "red">("todos");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);

  useEffect(() => {
    fetch("/api/alunos")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setClients(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = clients.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const health = getHealth(c);
    const matchFilter = filter === "todos" || health === filter;
    return matchSearch && matchFilter;
  });

  function handleNewStudent(c: Client) {
    setClients((prev) => [c, ...prev]);
    setShowNew(false);
  }

  function handleUpdate(updated: Client) {
    setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setSelected(updated);
  }

  const counts = {
    green: clients.filter((c) => getHealth(c) === "green").length,
    yellow: clients.filter((c) => getHealth(c) === "yellow").length,
    red: clients.filter((c) => getHealth(c) === "red").length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alunos Ativos</h1>
          <p className="text-gray-500 text-sm mt-1">Acompanhe a saúde e evolução de cada aluno</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#6366f1" }}>
          <Plus className="w-4 h-4" />
          Novo Aluno
        </button>
      </div>

      {/* Summary cards */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-indigo-500" />
              <span className="text-xs text-gray-500">Total de alunos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">Em dia</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{counts.green}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-gray-500">Atenção</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{counts.yellow}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-gray-500">Crítico</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{counts.red}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input placeholder="Buscar aluno..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div className="flex gap-1">
          {(["todos", "green", "yellow", "red"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
              style={filter === f ? { background: "#6366f1" } : {}}>
              {f === "todos" ? "Todos" : healthLabel[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Dumbbell className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">{clients.length === 0 ? "Nenhum aluno cadastrado" : "Nenhum aluno encontrado"}</p>
          <p className="text-gray-300 text-sm mt-1">{clients.length === 0 ? "Clique em \"Novo Aluno\" para começar" : "Tente mudar os filtros"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((student) => {
            const health = getHealth(student);
            const pendingCount = student.sales.flatMap((s) => s.installments).filter((i) => i.status === "pendente").length;
            const lastCheckin = student.checkIns[0];
            return (
              <div key={student.id}
                onClick={() => setSelected(student)}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
                <div className="h-1.5 w-full" style={{ background: health === "green" ? "#10b981" : health === "yellow" ? "#f59e0b" : "#ef4444" }} />
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: "#6366f1" }}>
                        {getInitials(student.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{student.name}</p>
                        <p className="text-xs text-gray-400">{student.email || student.phone || "Sem contato"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium" style={{ background: healthBg[health] }}>
                      {healthIcon[health]}
                      <span className={health === "green" ? "text-green-600" : health === "yellow" ? "text-amber-600" : "text-red-600"}>
                        {healthLabel[health]}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400">Último check-in</p>
                      <p className="font-medium text-gray-700">{lastCheckin ? formatDate(lastCheckin.createdAt) : "Nunca"}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400">Treino ativo</p>
                      <p className="font-medium text-gray-700">{student.workoutPlans.length > 0 ? student.workoutPlans[0].name : "Nenhum"}</p>
                    </div>
                  </div>

                  {pendingCount > 0 && (
                    <div className="mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                        {pendingCount} parcela(s) pendente(s)
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
                    <span className="text-xs text-gray-400">Desde {formatDate(student.createdAt)}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showNew && <NewStudentModal onClose={() => setShowNew(false)} onSave={handleNewStudent} />}
      {selected && (
        <StudentDetailModal
          client={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

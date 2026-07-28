"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Plus, Search, X, Trash2, Phone, Mail, Users, CheckCircle2,
  AlertTriangle, ChevronRight, DollarSign, Edit2, Save, Upload,
  ExternalLink, FileText, Filter, Download, RefreshCw, RefreshCcw, ChevronDown,
  MessageSquare, Check, Circle, Zap, Star, ArrowRight, ListChecks,
  MessageCircle, Calendar, Loader2, Paperclip,
} from "lucide-react";
import { ReceivablesTable } from "@/components/financeiro/ReceivablesTable";
import {
  buildPreset, toApiInstallments, sumTotals, emptyLine, defaultCashDate,
  toNumber, RECEIVABLE_METHODS,
  type ReceivableLine, type PresetId,
} from "@/lib/financeiro/receivables";

// ─── Types ────────────────────────────────────────────────────────
type ServicePlan = {
  id: string; name: string; description?: string | null;
  totalAmount: number; installments: number; durationMonths: number; active: boolean;
};
type NegotiationType = "cash" | "pix" | "card" | "custom";
type Installment = { id: string; status: string; dueDate: string; paidAt?: string | null; amount: number; number: number; label?: string | null; netValue?: number | null; paymentMethod?: string | null };
type Sale = {
  id: string; description: string; totalAmount: number; installmentsCount: number;
  paymentMethod?: string | null; negotiationType?: string | null;
  grossValue?: number | null; netValue?: number | null; cashFlowDate?: string | null;
  servicePlanId?: string | null; installments: Installment[];
};
type StudentFile = { id: string; name: string; url: string; category: string; fileType: string };
type ClientTask = {
  id: string; title: string; status: string; type: string;
  dueDate: string | null; urgent: boolean | null; important: boolean | null;
};
type Observacao = { id: string; type: string; content: string; date: string };
type InvoiceIssue = {
  id: string;
  status: string;
  amount: number;
  serviceDescription: string;
  externalProvider?: string | null;
  invoiceNumber?: string | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

type Aluno = {
  id: string; name: string; email?: string | null; phone?: string | null;
  cpf?: string | null;
  notes?: string | null; status: string; source?: string | null;
  planName?: string | null; planDetails?: string | null;
  paymentMethod?: string | null; negotiationNotes?: string | null;
  contractUrl?: string | null; tags: string[]; createdAt: string;
  sales: Sale[]; files: StudentFile[];
  invoiceIssues?: InvoiceIssue[];
};

// ─── Constants ────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "ativo",   label: "Ativo",   color: "bg-green-100 text-green-700" },
  { value: "inativo", label: "Inativo", color: "bg-gray-100 text-gray-500" },
  { value: "lead",    label: "Lead",    color: "bg-blue-100 text-blue-600" },
  { value: "pausado", label: "Pausado", color: "bg-amber-100 text-amber-600" },
];
// Planos especiais sem preço fixo (sem plano cadastrado)
const SPECIAL_PLAN_OPTIONS = [
  { value: "Personalizado",   label: "Personalizado / Collab" },
  { value: "Parceria/Collab", label: "Parceria sem cobrança" },
];
const FUNIL_OPTIONS = ["Instagram", "Indicação", "WhatsApp", "TikTok", "Google", "Site", "Evento", "Outro"];
const PAYMENT_METHODS = ["Pix", "Débito", "Crédito", "Transferência", "Boleto", "Dinheiro"];
const NEG_TYPES: { value: NegotiationType; label: string; desc: string }[] = [
  { value: "cash",   label: "À vista",        desc: "Pagamento único numa data" },
  { value: "pix",    label: "PIX parcelado",   desc: "Parcelas independentes via PIX" },
  { value: "card",   label: "Cartão",          desc: "Crédito com ou sem antecipação" },
  { value: "custom", label: "Personalizado",   desc: "Datas e valores completamente livres" },
];

function statusCfg(s: string) { return STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0]; }
function getInitials(n: string) { return n.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function sourceLabel(s: string | null | undefined): string {
  if (!s) return "";
  if (s === "checkout_infinitepay") return "Checkout InfinitePay";
  return s;
}
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

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// A IA de /api/alunos/analisar responde formas de pagamento fora do
// vocabulário de RECEIVABLE_METHODS (ex: "Crédito", "Débito"). Normaliza
// qualquer valor recebido para uma opção válida do select de linhas.
function toReceivableMethod(raw: string | null | undefined): string {
  if (raw === "Crédito" || raw === "Débito") return "Cartão";
  if (raw && (RECEIVABLE_METHODS as readonly string[]).includes(raw)) return raw;
  return "Outro";
}

function isValidIsoDate(v: unknown): v is string {
  return typeof v === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && !isNaN(new Date(v + "T12:00:00").getTime());
}

// ─── AlunoPaymentForm ──────────────────────────────────────────────
function AlunoPaymentForm({
  aluno, plans, onSaved, onCancel,
}: {
  aluno: Aluno;
  plans: ServicePlan[];
  onSaved: (sale: Sale) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSummary, setAiSummary] = useState("");

  // Plano selecionado
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [customPlanName, setCustomPlanName] = useState("");
  const [negotiationNotes, setNegotiationNotes] = useState(aluno.negotiationNotes || "");

  // Recebimentos por linha — cada linha tem sua própria forma de pagamento,
  // data combinada com o aluno e data real de entrada no caixa.
  const [lines, setLines] = useState<ReceivableLine[]>(() => [emptyLine(today)]);
  const [presetTotal, setPresetTotal] = useState("");
  const [presetEntry, setPresetEntry] = useState("");
  const [presetParcelas, setPresetParcelas] = useState(2);

  const plan = plans.find(p => p.id === selectedPlanId);

  // Gera as parcelas do plano ao selecioná-lo — continuam 100% editáveis depois.
  function applyPlan(p: ServicePlan) {
    setSelectedPlanId(p.id);
    setCustomPlanName("");
    setPresetTotal(String(p.totalAmount));
    setLines(buildPreset("plan_installments", {
      total:     p.totalAmount,
      startDate: today,
      parcelas:  p.installments,
    }));
  }

  // IA
  async function handleAnalyzeIA() {
    if (!negotiationNotes.trim()) return;
    setAnalyzing(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/alunos/analisar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: negotiationNotes,
          serviceValue: presetTotal || plan?.totalAmount,
          planName: plan?.name || customPlanName,
          paymentMethod: toReceivableMethod(aluno.paymentMethod || "Pix"),
        }),
      });
      const data = await res.json();
      if (data.customInstallments?.length) {
        const fallbackMethod = toReceivableMethod(data.paymentMethod || "Pix");
        setLines(data.customInstallments.map((i: {
          amount: number; dueDate: string; label?: string; paymentMethod?: string;
        }, idx: number) => {
          const dueDate = isValidIsoDate(i.dueDate) ? i.dueDate : today;
          const method  = i.paymentMethod ? toReceivableMethod(i.paymentMethod) : fallbackMethod;
          const base = emptyLine(dueDate);
          return {
            ...base,
            amount:        String(i.amount),
            dueDate,
            cashDate:      defaultCashDate(dueDate, method),
            paymentMethod: method,
            label:         i.label || `${idx + 1}ª parcela`,
          };
        }));
        if (data.totalAmount) setPresetTotal(String(data.totalAmount));
        if (data.summary) setAiSummary(data.summary);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    const descricao = plan?.name || customPlanName || "Plano";
    const parcelas  = toApiInstallments(lines);
    if (parcelas.length === 0) return;

    const totals = sumTotals(lines);
    const body: Record<string, unknown> = {
      clientId:           aluno.id,
      description:        descricao,
      negotiationNotes:   negotiationNotes || null,
      servicePlanId:      selectedPlanId || null,
      totalAmount:        totals.faturamento,
      grossValue:         totals.faturamento,
      netValue:           totals.caixa,
      customInstallments: parcelas,
      // Rótulo descritivo apenas; não controla mais a lógica de exibição.
      negotiationType:    parcelas.length === 1 ? "cash" : "custom",
      paymentMethod:      parcelas[0].paymentMethod,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/financeiro/vendas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const sale = await res.json();
      if (sale.id) onSaved(sale);
      else alert("Erro ao salvar: " + (sale.error || "tente novamente"));
    } finally {
      setSaving(false);
    }
  }

  const totals = sumTotals(lines);
  const inputClsLocal = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white";
  const inputSmCls = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white";

  return (
    <div className="space-y-5">

      {/* Seção 1 — Plano */}
      <div>
        <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Plano / Produto</p>
        <div className="grid grid-cols-2 gap-2">
          {plans.filter(p => p.active).map(p => (
            <button key={p.id} onClick={() => applyPlan(p)}
              className={`text-left px-3 py-2 rounded-xl border text-sm transition-all ${
                selectedPlanId === p.id
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 hover:border-indigo-300 text-gray-700"
              }`}>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-gray-400">{fmt(p.totalAmount)} · {p.durationMonths} {p.durationMonths === 1 ? "mês" : "meses"}</p>
            </button>
          ))}
          <button onClick={() => { setSelectedPlanId(""); setCustomPlanName(""); }}
            className={`text-left px-3 py-2 rounded-xl border text-sm transition-all ${
              !selectedPlanId ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:border-indigo-300 text-gray-700"
            }`}>
            <p className="font-semibold">Personalizado</p>
            <p className="text-xs text-gray-400">Valor e condições livres</p>
          </button>
        </div>
        {!selectedPlanId && (
          <input value={customPlanName} onChange={e => setCustomPlanName(e.target.value)}
            placeholder="Nome do plano personalizado (ex: Mensal, Pacote especial...)"
            className={`${inputClsLocal} mt-2`} />
        )}
        {plan && (
          <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-700">
            <span className="font-bold">{plan.name}</span> — {fmt(plan.totalAmount)} · {plan.durationMonths} meses
            {plan.description && <span className="text-indigo-500"> · {plan.description}</span>}
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Como vai receber</p>

        <div className="flex flex-wrap gap-2 items-end mb-3">
          <label className="text-[11px] text-gray-500">
            Valor total
            <input type="text" inputMode="decimal" value={presetTotal} placeholder="0,00"
              onChange={e => setPresetTotal(e.target.value)}
              className={`${inputSmCls} w-28 block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-500">
            Entrada
            <input type="text" inputMode="decimal" value={presetEntry} placeholder="0,00"
              onChange={e => setPresetEntry(e.target.value)}
              className={`${inputSmCls} w-28 block mt-0.5`} />
          </label>
          <label className="text-[11px] text-gray-500">
            Parcelas
            <input type="number" min={1} max={60} step={1} value={presetParcelas}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                setPresetParcelas(Number.isFinite(n) ? Math.min(60, Math.max(1, n)) : 1);
              }}
              className={`${inputSmCls} w-20 block mt-0.5`} />
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {([
            ["card_full",             "Total no cartão"],
            ["pix_full",              "Pix à vista"],
            ["entry_pix_installments","Entrada + parcelas Pix"],
            ["entry_then_card",       "Entrada + cartão depois"],
            ["entry_then_pix",        "Entrada + Pix depois"],
          ] as [PresetId, string][]).map(([id, label]) => (
            <button key={id} type="button"
              onClick={() => setLines(buildPreset(id, {
                total:       toNumber(presetTotal),
                startDate:   today,
                entryAmount: toNumber(presetEntry),
                parcelas:    presetParcelas,
              }))}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:border-indigo-400 hover:text-indigo-600 bg-white">
              {label}
            </button>
          ))}
        </div>

        <ReceivablesTable lines={lines} onChange={setLines} startDate={today} />
      </div>

      {/* IA */}
      <div>
        <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">Negociação (texto livre)</p>
        <div className="relative">
          <textarea rows={2} value={negotiationNotes} onChange={e => setNegotiationNotes(e.target.value)}
            placeholder="Ex: R$400 entrada hoje, restante em 4x de R$500 nos dias 10 de cada mês..."
            className={`${inputClsLocal} resize-none pr-28`}/>
          <div className="absolute right-2 bottom-2 flex gap-1">
            {aiSummary && (
              <button onClick={() => { setAiSummary(""); setLines([emptyLine(today)]); }}
                title="Limpar leitura IA"
                className="text-[10px] px-2 py-1 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300">
                Limpar
              </button>
            )}
            <button onClick={handleAnalyzeIA} disabled={analyzing || !negotiationNotes.trim()}
              className="text-[10px] px-2.5 py-1 rounded-lg text-white disabled:opacity-40"
              style={{ background: "#6366f1" }}>
              {analyzing ? "Analisando..." : aiSummary ? "✨ Refazer" : "✨ Analisar"}
            </button>
          </div>
        </div>
        {aiSummary && (
          <div className="mt-1.5 text-xs bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-indigo-800">
            <span className="font-bold">IA detectou:</span> {aiSummary}
            <span className="text-indigo-500 ml-2">(edite as parcelas acima se necessário)</span>
          </div>
        )}
      </div>

      {/* Botões */}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving || totals.faturamento === 0}
          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#6366f1" }}>
          {saving ? "Salvando..." : "Salvar e enviar ao Financeiro"}
        </button>
      </div>
    </div>
  );
}

// ─── Modal Novo Aluno ─────────────────────────────────────────────
function NovoAlunoModal({ onClose, onSave, plans }: { onClose: () => void; onSave: (a: Aluno) => void; plans: ServicePlan[] }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", status: "ativo", source: "",
    planName: "", planDetails: "", notes: "",
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

  const isSpecial = SPECIAL_PLAN_OPTIONS.some(p => p.value === form.planName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Novo Aluno</h2>
            <p className="text-xs text-gray-400 mt-0.5">Após cadastrar, você registra o pagamento na ficha do aluno</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSave} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Nome *</label>
              <input required autoFocus value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Telefone</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={form.phone} onChange={e => set("phone", formatPhone(e.target.value))}
                  placeholder="(XX) XXXXX-XXXX" maxLength={15}
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@exemplo.com" className={inputCls} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Plano</label>
              <div className="grid grid-cols-2 gap-2">
                {plans.filter(p => p.active).map(p => (
                  <button type="button" key={p.id} onClick={() => set("planName", p.name)}
                    className={`text-left px-3 py-2 rounded-xl border text-sm transition-all ${
                      form.planName === p.name
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:border-indigo-300 text-gray-700"
                    }`}>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-gray-400">{fmt(p.totalAmount)} · {p.durationMonths} {p.durationMonths === 1 ? "mês" : "meses"}</p>
                  </button>
                ))}
                {SPECIAL_PLAN_OPTIONS.map(p => (
                  <button type="button" key={p.value} onClick={() => set("planName", p.value)}
                    className={`text-left px-3 py-2 rounded-xl border text-sm transition-all ${
                      form.planName === p.value
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:border-indigo-300 text-gray-700"
                    }`}>
                    <p className="font-semibold">{p.label}</p>
                    <p className="text-xs text-gray-400">Sem cobrança padrão</p>
                  </button>
                ))}
              </div>
              {isSpecial && (
                <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <p className="text-xs font-bold text-indigo-600 mb-1.5">
                    {form.planName === "Parceria/Collab" ? "Descreva a parceria / collab" : "Descreva o plano personalizado"}
                  </p>
                  <textarea rows={2} value={form.planDetails} onChange={e => set("planDetails", e.target.value)}
                    placeholder={form.planName === "Parceria/Collab" ? "Ex: 3 meses grátis em troca de divulgação..." : "Ex: 2x por semana online + 1x presencial..."}
                    className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white resize-none" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">De qual funil veio?</label>
              <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
                <option value="">Selecionar...</option>
                {FUNIL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Observações iniciais</label>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Objetivo, contexto, observações gerais..." className={`${inputCls} resize-none`} />
            <p className="text-[10px] text-gray-400 mt-1.5">
              💡 Pagamento e parcelas são registrados na ficha do aluno após o cadastro.
            </p>
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#6366f1" }}>
              {saving ? "Salvando..." : "Cadastrar aluno →"}
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
function AlunoDrawer({ aluno, onClose, onUpdate, onDelete, autoOpenPayForm, plans }: {
  aluno: Aluno; onClose: () => void; onUpdate: (a: Aluno) => void; onDelete: (id: string) => void;
  autoOpenPayForm?: boolean; plans: ServicePlan[];
}) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    name: aluno.name, email: aluno.email || "", phone: aluno.phone || "",
    cpf: aluno.cpf || "",
    status: aluno.status, source: aluno.source || "", planName: aluno.planName || "",
    planDetails: aluno.planDetails || "", paymentMethod: aluno.paymentMethod || "Pix",
    negotiationNotes: aluno.negotiationNotes || "", notes: aluno.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showPayForm, setShowPayForm] = useState(autoOpenPayForm ?? false);
  const [sales, setSales] = useState<Sale[]>(aluno.sales);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [observacoes, setObservacoes] = useState<Observacao[]>([]);
  const [newObsText, setNewObsText] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"info" | "tarefas" | "obs" | "arquivos">("info");
  const [files, setFiles] = useState<StudentFile[]>(aluno.files || []);
  // nova tarefa inline
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  // upload de arquivo avulso
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileAnyRef = useRef<HTMLInputElement>(null);
  // notas fiscais
  const [invoiceIssues, setInvoiceIssues] = useState<InvoiceIssue[]>(aluno.invoiceIssues ?? []);
  const [emittingInvoiceId, setEmittingInvoiceId] = useState<string | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch(`/api/tarefas?clientId=${aluno.id}&status=all`)
      .then(r => r.json())
      .then(data => setTasks(Array.isArray(data) ? data.filter((t: ClientTask) => t.status !== "done") : []));
    fetch(`/api/alunos/${aluno.id}/observacoes`)
      .then(r => r.json())
      .then(data => setObservacoes(Array.isArray(data) ? data : []));
  }, [aluno.id]);

  async function handleSaveObs() {
    if (!newObsText.trim()) return;
    setSavingObs(true);
    const res = await fetch(`/api/alunos/${aluno.id}/observacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newObsText.trim(), type: "nota" }),
    });
    const obs = await res.json();
    setObservacoes(prev => [obs, ...prev]);
    setNewObsText("");
    setSavingObs(false);
  }

  // Totais sempre calculados do sales state — reativos (devem vir antes de nextRecommendedAction)
  const allInstallments = sales.flatMap(s => s.installments);
  const pago    = allInstallments.filter(i => i.status === "pago").reduce((s, i) => s + i.amount, 0);
  const pendente = allInstallments.filter(i => i.status !== "pago").reduce((s, i) => s + i.amount, 0);
  const vencidas = allInstallments.filter(i => i.status !== "pago" && new Date(i.dueDate) < new Date());
  const health: "green" | "red" = vencidas.length > 0 ? "red" : "green";
  const contrato = aluno.files?.find(f => f.category === "contrato");

  // Próxima ação recomendada
  function nextRecommendedAction(): { text: string; color: string; icon: "alert" | "task" | "check" } | null {
    if (vencidas.length > 0) return { text: `${vencidas.length} parcela${vencidas.length > 1 ? "s" : ""} vencida${vencidas.length > 1 ? "s" : ""} — cobrar`, color: "red", icon: "alert" };
    const overdueTask = tasks.find(t => t.dueDate && new Date(t.dueDate) < new Date());
    if (overdueTask) return { text: `Tarefa atrasada: ${overdueTask.title}`, color: "amber", icon: "task" };
    const urgentTask = tasks.find(t => t.urgent);
    if (urgentTask) return { text: `Tarefa urgente: ${urgentTask.title}`, color: "orange", icon: "task" };
    return null;
  }
  const nextAction = nextRecommendedAction();

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/alunos/${aluno.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const updated = await res.json();
      if (updated.id) {
        onUpdate(updated);
        setEditando(false);
      } else {
        alert("Erro ao salvar: " + (updated.error || "tente novamente"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchInstallment(saleId: string, instId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/financeiro/vendas/${saleId}/parcelas/${instId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated = await res.json();
    setSales(prev => prev.map(s => s.id === saleId
      ? { ...s, installments: s.installments.map(i => i.id === instId ? { ...i, ...updated } : i) }
      : s
    ));
  }

  function toggleInstallment(saleId: string, instId: string, currentStatus: string) {
    return patchInstallment(saleId, instId, { status: currentStatus === "pago" ? "pendente" : "pago" });
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

  async function emitirNota(invoiceIssueId: string) {
    setEmittingInvoiceId(invoiceIssueId);
    try {
      const res = await fetch("/api/fiscal/notasy/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIssueId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const updated = data.invoice ?? { id: invoiceIssueId, status: "error", errorMessage: data.error };
        setInvoiceIssues(prev => prev.map(inv => inv.id === invoiceIssueId ? { ...inv, ...updated } : inv));
      } else {
        setInvoiceIssues(prev => prev.map(inv => inv.id === invoiceIssueId ? { ...inv, ...data } : inv));
      }
    } catch {
      setInvoiceIssues(prev => prev.map(inv =>
        inv.id === invoiceIssueId ? { ...inv, status: "error", errorMessage: "Falha de rede ao emitir nota" } : inv
      ));
    } finally {
      setEmittingInvoiceId(null);
    }
  }

  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return;
    setSavingTask(true);
    const res = await fetch("/api/tarefas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle.trim(), clientId: aluno.id, type: "student", status: "pending" }),
    });
    const task = await res.json();
    if (task.id) setTasks(prev => [task, ...prev]);
    setNewTaskTitle("");
    setSavingTask(false);
  }

  async function handleCompleteTask(taskId: string) {
    await fetch(`/api/tarefas/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function handleAnyFileUpload(file: File) {
    setUploadingFile(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "outro");
    const res = await fetch(`/api/alunos/${aluno.id}/arquivos`, { method: "POST", body: fd });
    const data = await res.json();
    if (!data.error) setFiles(prev => [data, ...prev]);
    setUploadingFile(false);
  }

  async function handleDelete() {
    if (!confirm(`Remover ${aluno.name} e todos os dados financeiros vinculados?`)) return;
    const res = await fetch(`/api/alunos/${aluno.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Erro ao remover aluno: ${data.error || "tente novamente"}`);
      return;
    }
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

        {/* Próxima ação recomendada */}
        {nextAction && (
          <div className={`px-5 py-2.5 flex items-center gap-2 text-sm font-medium ${
            nextAction.color === "red" ? "bg-red-50 text-red-700" :
            nextAction.color === "amber" ? "bg-amber-50 text-amber-700" :
            "bg-orange-50 text-orange-700"
          }`}>
            {nextAction.icon === "alert" ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Zap className="w-4 h-4 shrink-0" />}
            <p className="truncate">{nextAction.text}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-100 bg-white shrink-0">
          {[
            { id: "info" as const, label: "Perfil" },
            { id: "tarefas" as const, label: `Tarefas${tasks.length > 0 ? ` (${tasks.length})` : ""}` },
            { id: "obs" as const, label: `Obs.${observacoes.length > 0 ? ` (${observacoes.length})` : ""}` },
            { id: "arquivos" as const, label: `Arq.${files.length > 0 ? ` (${files.length})` : ""}` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDrawerTab(tab.id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                drawerTab === tab.id
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {/* ── Tab: Info ─────────────────── */}
          {drawerTab === "info" && (<>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase">Informações</span>
              <button onClick={() => setEditando(!editando)} className="text-xs font-medium text-indigo-600 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors">
                <Edit2 className="w-3 h-3" /> {editando ? "Cancelar edição" : "Editar dados"}
              </button>
            </div>

            {editando ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Nome *</label>
                  <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo" className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Telefone</label>
                  <input value={form.phone} onChange={e => set("phone", formatPhone(e.target.value))} placeholder="(XX) XXXXX-XXXX" maxLength={15} className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Status</label>
                  <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Email</label>
                  <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@exemplo.com" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">CPF</label>
                  <input value={form.cpf} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" maxLength={14} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Plano / Produto</label>
                  <input value={form.planName} onChange={e => set("planName", e.target.value)} placeholder="Nome do plano ou produto" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Detalhes do plano</label>
                  <textarea rows={2} value={form.planDetails} onChange={e => set("planDetails", e.target.value)}
                    placeholder="Descrição do plano, produto ou serviço contratado..."
                    className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Forma de pagamento</label>
                  <select value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)} className={inputCls}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Origem</label>
                  {aluno.source === "checkout_infinitepay" ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 rounded-lg bg-blue-50 h-[38px]">
                      <span className="text-xs text-blue-600 font-medium">Checkout InfinitePay</span>
                    </div>
                  ) : (
                    <select value={form.source} onChange={e => set("source", e.target.value)} className={inputCls}>
                      <option value="">Funil...</option>
                      {FUNIL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Negociação</label>
                  <textarea rows={2} value={form.negotiationNotes} onChange={e => set("negotiationNotes", e.target.value)}
                    placeholder="Notas de negociação..." className={`${inputCls} resize-none`} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Observações</label>
                  <textarea rows={3} value={form.notes} onChange={e => set("notes", e.target.value)}
                    placeholder="Observações internas..." className={`${inputCls} resize-none`} />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button onClick={() => setEditando(false)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving || !form.name.trim()}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1 disabled:opacity-50 transition-colors" style={{ background: "#6366f1" }}>
                    {saving
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                      : <><Save className="w-3.5 h-3.5" /> Salvar</>}
                  </button>
                </div>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {aluno.phone && (
                  <div className="flex items-center gap-1.5">
                    <a href={`tel:${aluno.phone.replace(/\D/g, "")}`} className="flex items-center gap-1.5 text-gray-700 hover:text-indigo-600 transition-colors">
                      <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />{formatPhone(aluno.phone)}
                    </a>
                    <a
                      href={`https://wa.me/55${aluno.phone.replace(/\D/g, "").replace(/^0/, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      title="Abrir WhatsApp"
                      className="ml-1 p-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
                {aluno.email && <div className="flex items-center gap-1.5 text-gray-700 truncate"><Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" /><a href={`mailto:${aluno.email}`} className="truncate hover:text-indigo-600 transition-colors">{aluno.email}</a></div>}
                {aluno.cpf && (
                  <div className="col-span-2 flex items-center gap-1.5 text-gray-600 text-sm">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">CPF</span>
                    <span>{formatCpf(aluno.cpf)}</span>
                  </div>
                )}
                <div className="col-span-2 flex flex-wrap gap-1.5 mt-1">
                  {aluno.planName && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{aluno.planName}</span>}
                  {aluno.paymentMethod && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{aluno.paymentMethod}</span>}
                  {aluno.source && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">📍 {sourceLabel(aluno.source)}</span>}
                </div>
                {aluno.planDetails && aluno.source !== "checkout_infinitepay" && (
                  <div className="col-span-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800">
                    <span className="font-bold">
                      {aluno.planName === "Parceria/Collab" ? "Parceria:" : "Personalizado:"}
                    </span>{" "}{aluno.planDetails}
                  </div>
                )}
                {aluno.negotiationNotes && (
                  <div className="col-span-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
                    <span className="font-bold">Negociação:</span> {aluno.negotiationNotes}
                  </div>
                )}
                {aluno.notes && <p className="col-span-2 text-xs text-gray-500 italic">{aluno.notes}</p>}
                <p className="col-span-2 text-xs text-gray-400">Desde {fmtDate(aluno.createdAt)}</p>
                {aluno.source === "checkout_infinitepay" && (
                  <div className="col-span-2 mt-1">
                    <button
                      onClick={() => setShowTechDetails(v => !v)}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${showTechDetails ? "rotate-180" : ""}`} />
                      Detalhes técnicos do checkout
                    </button>
                    {showTechDetails && (
                      <div className="mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] text-gray-500 space-y-1">
                        {aluno.planDetails && <p className="break-all text-gray-600">{aluno.planDetails}</p>}
                        {(() => {
                          const s0 = sales.find(s => s.grossValue != null && s.grossValue !== s.totalAmount);
                          if (!s0) return null;
                          const diff = (s0.grossValue ?? 0) - s0.totalAmount;
                          return (
                            <div className="mt-1 pt-1 border-t border-gray-200 space-y-0.5">
                              <p>Cobrado no cartão: <span className="font-semibold">{fmt(s0.grossValue!)}</span></p>
                              <p>Valor do serviço: <span className="font-semibold">{fmt(s0.totalAmount)}</span></p>
                              {diff > 0.005 && <p className="text-amber-600">Juros/taxa: <span className="font-semibold">{fmt(diff)}</span></p>}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contexto operacional */}
              {(() => {
                const all = sales.flatMap(s => s.installments);
                const lastPaid = all.filter(i => i.status === "pago" && i.paidAt)
                  .sort((a, b) => new Date(b.paidAt!).getTime() - new Date(a.paidAt!).getTime())[0];
                const nextDue = all.filter(i => i.status !== "pago")
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
                const monthsSince = Math.floor((Date.now() - new Date(aluno.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
                if (!lastPaid && !nextDue && monthsSince === 0) return null;
                return (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100">
                      <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Membro há</p>
                      <p className="text-sm font-bold text-gray-700">{monthsSince < 1 ? "<1" : monthsSince} {monthsSince <= 1 ? "mês" : "meses"}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 text-center border ${lastPaid ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
                      <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Último pag.</p>
                      <p className="text-xs font-bold text-gray-700">{lastPaid ? fmtDate(lastPaid.paidAt) : "—"}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 text-center border ${nextDue && new Date(nextDue.dueDate) < new Date() ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                      <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Próx. venc.</p>
                      <p className={`text-xs font-bold ${nextDue && new Date(nextDue.dueDate) < new Date() ? "text-red-600" : "text-amber-700"}`}>
                        {nextDue ? fmtDate(nextDue.dueDate) : "—"}
                      </p>
                    </div>
                  </div>
                );
              })()}
              </>
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
            {pago === 0 && pendente === 0 && !showPayForm ? (
              <button onClick={() => setShowPayForm(true)}
                className="w-full mb-4 py-4 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-500 hover:bg-indigo-50 transition-colors text-sm font-medium flex flex-col items-center gap-1">
                <DollarSign className="w-5 h-5" />
                Nenhum pagamento registrado
                <span className="text-xs text-indigo-400">Clique para registrar</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-center">
                  <p className="text-[10px] text-green-500 font-bold uppercase">Recebido</p>
                  <p className="text-base font-bold text-green-700">{fmt(pago)}</p>
                  <p className="text-[10px] text-green-400 mt-0.5">{allInstallments.filter(i => i.status === "pago").length} parcela{allInstallments.filter(i => i.status === "pago").length !== 1 ? "s" : ""}</p>
                </div>
                <div className={`rounded-xl p-3 border text-center ${vencidas.length > 0 ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                  <p className={`text-[10px] font-bold uppercase ${vencidas.length > 0 ? "text-red-500" : "text-amber-500"}`}>Pendente</p>
                  <p className={`text-base font-bold ${vencidas.length > 0 ? "text-red-700" : "text-amber-700"}`}>{fmt(pendente)}</p>
                  {vencidas.length > 0 && <p className="text-[10px] text-red-400 mt-0.5">{vencidas.length} vencida{vencidas.length !== 1 ? "s" : ""}</p>}
                </div>
              </div>
            )}

            {/* Formulário novo pagamento */}
            {showPayForm && (
              <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <AlunoPaymentForm
                  aluno={aluno}
                  plans={plans}
                  onSaved={sale => { setSales(prev => [sale, ...prev]); setShowPayForm(false); }}
                  onCancel={() => setShowPayForm(false)}
                />
              </div>
            )}

            {/* Lista de vendas */}
            {sales.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">Nenhum lançamento registrado</p>
              : sales.map(sale => {
                const pagas = sale.installments.filter(i => i.status === "pago").length;
                const negLabel = NEG_TYPES.find(t => t.value === sale.negotiationType)?.label;
                const displayValue = sale.netValue ?? sale.totalAmount;
                const hasOverdue = sale.installments.some(i => i.status !== "pago" && new Date(i.dueDate) < new Date());
                return (
                  <div key={sale.id} className={`mb-3 rounded-xl p-3 border ${hasOverdue ? "bg-red-50/40 border-red-200" : "bg-gray-50 border-gray-100"}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="text-sm font-semibold text-gray-800">{sale.description}</p>
                          {negLabel && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{negLabel}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {pagas}/{sale.installmentsCount} paga{pagas !== 1 ? "s" : ""}
                          {sale.paymentMethod && ` · ${sale.paymentMethod}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-700">{fmt(displayValue)}</p>
                          {sale.grossValue && sale.grossValue !== sale.totalAmount && (
                            <p className="text-[10px] text-gray-400">cobrado {fmt(sale.grossValue)}</p>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm(`Remover "${sale.description}" e todas as parcelas?`)) return;
                            await fetch(`/api/financeiro/vendas/${sale.id}`, { method: "DELETE" });
                            setSales(prev => prev.filter(s => s.id !== sale.id));
                          }}
                          className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 mt-1">
                      {sale.installments.sort((a, b) => a.number - b.number).map(inst => {
                        const isPago = inst.status === "pago";
                        const isVencida = !isPago && new Date(inst.dueDate) < new Date();
                        const instPmt = inst.paymentMethod || (sale.installmentsCount > 1 ? null : sale.paymentMethod);
                        return (
                          <div key={inst.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border text-xs ${
                            isPago ? "bg-green-50 border-green-200"
                            : isVencida ? "bg-red-50 border-red-200"
                            : "bg-white border-gray-200"
                          }`}>
                            <button
                              onClick={() => toggleInstallment(sale.id, inst.id, inst.status)}
                              className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                isPago ? "bg-green-500 border-green-500 text-white"
                                : isVencida ? "border-red-400 hover:bg-red-100"
                                : "border-gray-300 hover:bg-gray-100"
                              }`}
                              title={isPago ? "Desmarcar" : "Marcar como paga"}>
                              {isPago && <span className="text-[8px] font-bold">✓</span>}
                            </button>
                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                              <span className={`font-semibold shrink-0 ${isPago ? "text-green-700" : isVencida ? "text-red-600" : "text-gray-700"}`}>
                                {inst.label || `${inst.number}ª`} — {fmt(inst.amount)}
                              </span>
                              {instPmt && <span className="text-gray-400 text-[10px]">{instPmt}</span>}
                            </div>
                            <input
                              type="date"
                              defaultValue={inst.dueDate.slice(0, 10)}
                              onBlur={e => {
                                if (e.target.value && e.target.value !== inst.dueDate.slice(0, 10)) {
                                  patchInstallment(sale.id, inst.id, { dueDate: e.target.value });
                                }
                              }}
                              className="text-[10px] border-0 bg-transparent text-gray-400 focus:outline-none focus:text-gray-700 cursor-pointer w-24 text-right shrink-0"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Clique no círculo para marcar como paga · edite a data direto no campo</p>
                  </div>
                );
              })
            }
          </div>

          {/* Notas Fiscais */}
          {invoiceIssues.length > 0 && (
            <div className="px-5 py-4">
              <span className="text-[11px] font-bold text-gray-400 uppercase block mb-3">Notas Fiscais</span>
              <div className="space-y-2">
                {invoiceIssues.map(inv => {
                  const statusCfgInv: Record<string, { label: string; cls: string }> = {
                    ready:    { label: "Pronta",     cls: "bg-blue-100 text-blue-700" },
                    sending:  { label: "Enviando…",  cls: "bg-indigo-100 text-indigo-600" },
                    pending:  { label: "Pendente",   cls: "bg-amber-100 text-amber-700" },
                    sent:     { label: "Enviada",    cls: "bg-indigo-100 text-indigo-700" },
                    issued:   { label: "Emitida",    cls: "bg-green-100 text-green-700" },
                    error:    { label: "Erro",       cls: "bg-red-100 text-red-700" },
                    cancelled:{ label: "Cancelada",  cls: "bg-gray-100 text-gray-500" },
                  };
                  const sc = statusCfgInv[inv.status] ?? { label: inv.status, cls: "bg-gray-100 text-gray-500" };
                  const isEmitting = emittingInvoiceId === inv.id;
                  const canEmit = inv.status === "ready";
                  const canResend = inv.status === "error" || inv.status === "sent";
                  return (
                    <div key={inv.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                        <div className="flex items-center gap-2 ml-auto">
                          {inv.externalProvider && (
                            <span className="text-[10px] text-gray-400 uppercase">{inv.externalProvider}</span>
                          )}
                          {inv.invoiceNumber && (
                            <span className="text-[10px] font-mono text-gray-500">#{inv.invoiceNumber}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-700 font-medium truncate">{inv.serviceDescription}</p>
                      <p className="text-xs text-gray-500">{fmt(inv.amount)}</p>
                      {inv.errorMessage && (
                        <p className="text-[10px] text-red-500 mt-1 break-words">{inv.errorMessage}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> PDF
                          </a>
                        )}
                        {inv.xmlUrl && (
                          <a href={inv.xmlUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> XML
                          </a>
                        )}
                        {(canEmit || canResend) && (
                          <button
                            onClick={() => emitirNota(inv.id)}
                            disabled={isEmitting}
                            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white disabled:opacity-60"
                            style={{ background: canResend ? "#ef4444" : "#6366f1" }}
                          >
                            {isEmitting
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Enviando…</>
                              : canResend
                                ? <><RefreshCw className="w-3 h-3" /> Reenviar</>
                                : <><FileText className="w-3 h-3" /> Emitir na Notasy</>
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>)} {/* end drawerTab === "info" */}

          {/* ── Tab: Tarefas ──────────────────── */}
          {drawerTab === "tarefas" && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Tarefas vinculadas
                </span>
                <a href="/tarefas" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
                  Ver todas <ArrowRight className="w-3 h-3" />
                </a>
              </div>

              {/* Nova tarefa rápida */}
              <div className="flex gap-2 mb-4">
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateTask(); }}
                  placeholder="Nova tarefa para este aluno... (Enter)"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
                <button
                  onClick={handleCreateTask}
                  disabled={savingTask || !newTaskTitle.trim()}
                  className="px-3 py-2 rounded-lg text-sm text-white disabled:opacity-50"
                  style={{ background: "#6366f1" }}
                >
                  {savingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="text-center py-4">
                  <Check className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Nenhuma tarefa pendente para este aluno.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tasks.map(task => {
                    const isOverdueTask = task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <div key={task.id} className={`flex items-start gap-2 p-2.5 rounded-xl border ${
                        isOverdueTask ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
                      }`}>
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 hover:border-indigo-500 transition-colors flex items-center justify-center ${
                            isOverdueTask ? "border-red-300" : "border-gray-300"
                          }`}
                          title="Marcar como feita"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            {task.urgent && <Zap className="w-3 h-3 text-red-500 shrink-0" />}
                            {!task.urgent && task.important && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                            <p className="text-sm text-gray-800 truncate">{task.title}</p>
                          </div>
                          {task.dueDate && (
                            <p className={`text-xs mt-0.5 ${isOverdueTask ? "text-red-500" : "text-gray-400"}`}>
                              {isOverdueTask ? "Atrasada · " : ""}{fmtDate(task.dueDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Observações ──────────────── */}
          {drawerTab === "obs" && (
            <div className="px-5 py-4">
              <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1.5 mb-3">
                <MessageSquare className="w-3.5 h-3.5" /> Observações rápidas
              </span>

              {/* Quick note input */}
              <div className="flex gap-2 mb-4">
                <input
                  value={newObsText}
                  onChange={e => setNewObsText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveObs(); } }}
                  placeholder="Adicionar observação… (Enter para salvar)"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
                <button
                  onClick={handleSaveObs}
                  disabled={savingObs || !newObsText.trim()}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ background: "#6366f1" }}
                >
                  {savingObs ? "..." : "Salvar"}
                </button>
              </div>

              {observacoes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Nenhuma observação registrada.</p>
              ) : (
                <div className="space-y-2">
                  {observacoes.map(obs => (
                    <div key={obs.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <p className="text-sm text-gray-700 leading-relaxed">{obs.content}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(obs.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* ── Tab: Arquivos ──────────────────── */}
          {drawerTab === "arquivos" && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" /> Arquivos
                </span>
                <button
                  onClick={() => fileAnyRef.current?.click()}
                  disabled={uploadingFile}
                  className="text-xs text-indigo-600 flex items-center gap-1 hover:underline disabled:opacity-50"
                >
                  {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Enviar arquivo
                </button>
                <input
                  ref={fileAnyRef}
                  type="file"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleAnyFileUpload(e.target.files[0]); }}
                />
              </div>

              {files.length === 0 ? (
                <div className="text-center py-8">
                  <button
                    onClick={() => fileAnyRef.current?.click()}
                    className="flex flex-col items-center gap-2 mx-auto text-gray-400 hover:text-indigo-500 transition-colors"
                  >
                    <Paperclip className="w-8 h-8 text-gray-200" />
                    <p className="text-xs">Nenhum arquivo. Clique para enviar.</p>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 bg-gray-50">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-400">{f.category}</p>
                      </div>
                      {f.url.startsWith("data:") ? (
                        <a href={f.url} download={f.name} className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
function AlunosPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [autoOpenPay, setAutoOpenPay] = useState(false);
  const [plans, setPlans] = useState<ServicePlan[]>([]);

  useEffect(() => {
    fetch("/api/configuracoes/planos").then(r => r.json()).then(data => {
      setPlans(Array.isArray(data) ? data.filter((p: ServicePlan) => p.active) : []);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/alunos").then(r => r.json()).then(data => {
      const list: Aluno[] = Array.isArray(data) ? data : [];
      setAlunos(list);
      setLoading(false);
      // suporte a ?open=<id> — abre o drawer automaticamente
      const openId = searchParams.get("open");
      if (openId) {
        const target = list.find(a => a.id === openId);
        if (target) setSelected(target);
      }
    });
  }, [searchParams]);

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
                  {allFunis.map(f => <option key={f} value={f}>{f === "checkout_infinitepay" ? "Checkout InfinitePay" : f}</option>)}
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
          <div className="flex items-center justify-center py-32 gap-2 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Carregando alunos...
          </div>
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
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                        {aluno.source === "checkout_infinitepay"
                          ? <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-medium">Checkout</span>
                          : aluno.source || "—"}
                      </td>
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

      {showNovo && <NovoAlunoModal plans={plans} onClose={() => setShowNovo(false)} onSave={a => {
        setAlunos(prev => [...prev, a].sort((x, y) => x.name.localeCompare(y.name)));
        setShowNovo(false);
        setSelected(a);
        setAutoOpenPay(true);
      }} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={() => { setShowImport(false); load(); }} />}
      {selected && (
        <AlunoDrawer aluno={selected} autoOpenPayForm={autoOpenPay} plans={plans}
          onClose={() => {
            setSelected(null);
            setAutoOpenPay(false);
            if (searchParams.get("open")) router.replace("/alunos");
          }}
          onUpdate={a => { setAlunos(prev => prev.map(x => x.id === a.id ? a : x)); setSelected(a); }}
          onDelete={id => {
            setAlunos(prev => prev.filter(x => x.id !== id));
            setSelected(null);
            setAutoOpenPay(false);
            if (searchParams.get("open")) router.replace("/alunos");
          }} />
      )}
    </div>
  );
}

export default function AlunosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Carregando...
      </div>
    }>
      <AlunosPageContent />
    </Suspense>
  );
}

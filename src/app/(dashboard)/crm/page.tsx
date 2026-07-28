"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Phone, Mail, MoreHorizontal, Loader2, Trash2, Pencil,
  MapPin, Target, Calendar, ChevronLeft, ChevronRight, Save, X,
  UserPlus, AlertTriangle, Clock, Filter, TrendingUp, BarChart2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { defaultCashDate, toReceivableMethod } from "@/lib/financeiro/receivables";

// ─── Pipeline stages ─────────────────────────────────────────────────────────

const stages = [
  { id: "novo_lead",        label: "Novo Lead",        color: "#6366f1" },
  { id: "contatado",        label: "Contatado",        color: "#8b5cf6" },
  { id: "qualificado",      label: "Qualificado",      color: "#f59e0b" },
  { id: "proposta_enviada", label: "Proposta Enviada", color: "#3b82f6" },
  { id: "call_agendada",    label: "Call Agendada",    color: "#06b6d4" },
  { id: "call_feita",       label: "Call Feita",       color: "#10b981" },
  { id: "fechado",          label: "Fechado",          color: "#64748b" },
  { id: "perdido",          label: "Perdido",          color: "#ef4444" },
];

const sourceOptions = ["Instagram", "Indicação", "WhatsApp", "Tráfego pago", "Outro"];

const funnelOptions = [
  "Orgânico", "Funil de E-mail", "Funil de WhatsApp", "Stories",
  "Anúncio Pago", "Parceria", "Webinar", "Outro",
];

const priorityColor = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };
const priorityLabel = { low: "Baixa", medium: "Média", high: "Alta" };

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

const PAYMENT_METHODS = ["Pix", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Transferência", "Dinheiro"];

type ServicePlan = { id: string; name: string; totalAmount: number; installments: number };

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Client = {
  id: string; name: string;
  phone?: string | null; email?: string | null; instagram?: string | null;
};

type Deal = {
  id: string; title: string;
  value?: number | null; potentialValue?: number | null; closedValue?: number | null;
  stage: string; priority: "low" | "medium" | "high";
  nextAction?: string | null; notes?: string | null;
  source?: string | null; funnel?: string | null;
  objectives?: string | null; objection?: string | null;
  firstContact: string; updatedAt: string;
  client: Client;
};

type GoalItemData = { id?: string; label: string; quantity: number; unitPrice: number };
type GoalData = {
  id?: string; month: number; year: number;
  revenueGoal: number; newClientsGoal: number; leadsGoal: number; conversionGoal: number;
  averageTicketGoal: number; closingRateGoal: number; qualificationRateGoal: number;
  weeksPerMonth: number; businessDaysPerWeek: number;
  notes: string; items: GoalItemData[];
};
type ResultData = { revenue: number; leadsCount: number; conversionRate: number; newClients: number };

type DashboardData = {
  goal: { revenueGoal: number; averageTicketGoal: number; closingRateGoal: number; qualificationRateGoal: number };
  realized: number; gap: number; projection: number;
  closingsNeeded: number; opportunitiesNeeded: number; leadsNeeded: number;
  funnel: { stage: string; count: number }[];
  conversions: { from: string; to: string; rate: number }[];
  overallConversion: number;
  bySource: { source: string; leads: number; closings: number; revenue: number }[];
  bottlenecks: {
    withoutNextAction: { id: string; title: string; stage: string; clientName: string }[];
    proposalsWithoutFollowUp: { id: string; title: string; clientName: string; updatedAt: string }[];
    callsWithoutReturn: { id: string; title: string; clientName: string; updatedAt: string }[];
    lostByObjection: { objection: string; count: number }[];
  };
};

// ─── DealForm ────────────────────────────────────────────────────────────────

const emptyForm = {
  title: "", clientId: "", clientName: "", clientEmail: "", clientPhone: "", clientInstagram: "",
  value: "", potentialValue: "", closedValue: "",
  stage: "novo_lead", priority: "medium", nextAction: "", notes: "",
  source: "", funnel: "", objectives: "", objection: "",
  firstContact: new Date().toISOString().split("T")[0],
};
type FormState = typeof emptyForm;

function DealForm({
  form, setForm, clients, isEdit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  clients: Client[];
  isEdit: boolean;
}) {
  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <input
        placeholder="Título do negócio *"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
      />

      {!isEdit && clients.length > 0 && (
        <select
          value={form.clientId}
          onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, clientName: "" }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"
        >
          <option value="">Novo cliente / selecionar existente</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      {(!form.clientId || isEdit) && (
        <>
          <input
            placeholder={isEdit ? "Nome do cliente" : "Nome do cliente *"}
            value={form.clientName}
            onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="E-mail"
              value={form.clientEmail}
              onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
            <input
              placeholder="Telefone / WhatsApp"
              value={form.clientPhone}
              onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
          <input
            placeholder="Instagram (ex: @usuario) — opcional"
            value={form.clientInstagram}
            onChange={(e) => setForm((f) => ({ ...f, clientInstagram: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
          />
        </>
      )}

      <div className="border-t border-gray-100 pt-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Origem</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">De onde veio</label>
          <select
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"
          >
            <option value="">Selecionar...</option>
            {sourceOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Por qual funil</label>
          <select
            value={form.funnel}
            onChange={(e) => setForm((f) => ({ ...f, funnel: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"
          >
            <option value="">Selecionar...</option>
            {funnelOptions.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Data do primeiro contato</label>
        <input
          type="date"
          value={form.firstContact}
          onChange={(e) => setForm((f) => ({ ...f, firstContact: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Objetivos do cliente</label>
        <textarea
          placeholder="Ex: Emagrecer 10kg, ganhar massa muscular..."
          value={form.objectives}
          onChange={(e) => setForm((f) => ({ ...f, objectives: e.target.value }))}
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
        />
      </div>

      <div className="border-t border-gray-100 pt-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Negócio</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select
          value={form.stage}
          onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"
        >
          {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"
        >
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Valor (R$)</label>
          <input
            type="number"
            placeholder="0,00"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Valor potencial (R$)</label>
          <input
            type="number"
            placeholder="0,00"
            value={form.potentialValue}
            onChange={(e) => setForm((f) => ({ ...f, potentialValue: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      {form.stage === "fechado" && (
        <div>
          <label className="text-xs text-green-600 font-semibold mb-1 block">Valor fechado (R$)</label>
          <input
            type="number"
            placeholder="Valor real da venda"
            value={form.closedValue}
            onChange={(e) => setForm((f) => ({ ...f, closedValue: e.target.value }))}
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-green-50"
          />
        </div>
      )}

      <input
        placeholder="Próxima ação (ex: Ligar segunda-feira)"
        value={form.nextAction}
        onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
      />
      <textarea
        placeholder="Observações gerais"
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        rows={2}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
      />

      {form.stage === "perdido" && (
        <div>
          <label className="text-xs text-red-500 font-semibold mb-1 block">Motivo da perda / Objeção *</label>
          <select
            value={form.objection}
            onChange={(e) => setForm((f) => ({ ...f, objection: e.target.value }))}
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-red-50 text-red-700"
          >
            <option value="">Selecionar motivo...</option>
            <option value="Preço muito alto">Preço muito alto</option>
            <option value="Sem tempo agora">Sem tempo agora</option>
            <option value="Escolheu outro profissional">Escolheu outro profissional</option>
            <option value="Sem interesse confirmado">Sem interesse confirmado</option>
            <option value="Sem resposta">Sem resposta (ghost)</option>
            <option value="Problema financeiro">Problema financeiro</option>
            <option value="Outro">Outro</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, goal, label, format }: { value: number; goal: number; label: string; format: "currency" | "number" | "percent" }) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  const color = pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#6366f1";
  const fmt = (n: number) => {
    if (format === "currency") return formatCurrency(n);
    if (format === "percent") return `${n.toFixed(1)}%`;
    return String(Math.round(n));
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{fmt(value)}</span>{" / "}{fmt(goal)}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-right text-xs text-gray-400 mt-0.5">{pct.toFixed(0)}%</p>
    </div>
  );
}

// ─── ConvertModal ─────────────────────────────────────────────────────────────

function ConvertModal({ deal, onClose, onDone }: { deal: Deal; onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [payment, setPayment] = useState({
    description:   deal.title,
    totalAmount:   deal.closedValue ? String(deal.closedValue) : deal.value ? String(deal.value) : "",
    installments:  "1",
    paymentMethod: "",
    firstDueDate:  new Date().toISOString().split("T")[0],
  });
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
    setPayment((prev) => ({ ...prev, description: plan.name, totalAmount: String(plan.totalAmount), installments: String(plan.installments) }));
  }

  async function handleConvert() {
    if (!payment.totalAmount || parseFloat(payment.totalAmount) <= 0) return;
    setSaving(true);
    const studentRes = await fetch("/api/alunos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: deal.client.name, email: deal.client.email ?? "", phone: deal.client.phone ?? "" }),
    });
    const student = await studentRes.json();
    if (student.id) {
      const count = parseInt(payment.installments) || 1;
      const perParcela = parseFloat(payment.totalAmount) / count;
      const firstDue = new Date(payment.firstDueDate + "T12:00:00");
      const metodo = toReceivableMethod(payment.paymentMethod || "Pix");
      const customInstallments = Array.from({ length: count }, (_, i) => {
        const d = new Date(firstDue);
        d.setMonth(d.getMonth() + i);
        const dueIso = d.toISOString().slice(0, 10);
        return {
          amount: perParcela,
          netValue: perParcela,
          dueDate: dueIso,
          cashDate: defaultCashDate(dueIso, metodo),
          paymentMethod: metodo,
          label: count === 1 ? "Pagamento" : `${i + 1}ª parcela`,
        };
      });
      await fetch("/api/financeiro/vendas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: student.id,
          description: payment.description,
          totalAmount: parseFloat(payment.totalAmount),
          paymentMethod: metodo,
          negotiationType: count === 1 ? "cash" : "custom",
          customInstallments,
        }),
      });
    }
    await fetch(`/api/crm/deals/${deal.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "fechado" }),
    });
    setSaving(false);
    onDone();
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-gray-900">Converter em Aluno</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="bg-indigo-50 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-indigo-800">{deal.client.name}</p>
          <p className="text-xs text-indigo-500">{deal.title}</p>
        </div>
        <div className="space-y-3">
          {plans.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plano pré-configurado</label>
              <select value={selectedPlanId} onChange={(e) => applyPlan(e.target.value)} className={inputCls}>
                <option value="">Selecionar plano...</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — R$ {p.totalAmount.toFixed(2)} / {p.installments}x</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input value={payment.description} onChange={(e) => setPayment((p) => ({ ...p, description: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor total (R$)</label>
              <input type="number" value={payment.totalAmount} onChange={(e) => setPayment((p) => ({ ...p, totalAmount: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parcelas</label>
              <input type="number" min="1" value={payment.installments} onChange={(e) => setPayment((p) => ({ ...p, installments: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento</label>
              <select value={payment.paymentMethod} onChange={(e) => setPayment((p) => ({ ...p, paymentMethod: e.target.value }))} className={inputCls}>
                <option value="">Selecionar...</option>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">1ª parcela</label>
              <input type="date" value={payment.firstDueDate} onChange={(e) => setPayment((p) => ({ ...p, firstDueDate: e.target.value }))} className={inputCls} />
            </div>
          </div>
          {payment.totalAmount && parseInt(payment.installments) > 1 && (
            <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700">
              {payment.installments}x de R$ {(parseFloat(payment.totalAmount) / parseInt(payment.installments)).toFixed(2)}
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">Cancelar</button>
          <button
            onClick={handleConvert}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "#6366f1" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Converter em aluno
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DashboardTab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [data,  setData]  = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    const res = await fetch(`/api/crm/dashboard?month=${m}&year=${y}`);
    setData(res.ok ? await res.json() : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(month, year); }, [month, year, load]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
    </div>
  );

  if (!data) return <p className="text-gray-400 text-center py-12">Erro ao carregar dashboard.</p>;

  const { goal, realized, gap, projection, closingsNeeded, opportunitiesNeeded, leadsNeeded,
          funnel, conversions, overallConversion, bySource, bottlenecks } = data;

  const realizationPct  = goal.revenueGoal > 0 ? Math.min((realized / goal.revenueGoal) * 100, 100) : 0;
  const maxFunnelCount  = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pb-6">

      {/* Navegação mês */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-lg font-bold text-gray-800 min-w-[160px] text-center">
          {MONTHS[month - 1]} {year}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Bloco topo: Meta / Realizado / Gap / Projeção */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Meta do Mês",  value: formatCurrency(goal.revenueGoal), color: "#6366f1", bg: "#eef2ff" },
            { label: "Realizado",    value: formatCurrency(realized),           color: "#10b981", bg: "#f0fdf4" },
            { label: "Gap",          value: formatCurrency(Math.abs(gap)),      color: gap <= 0 ? "#10b981" : "#ef4444", bg: gap <= 0 ? "#f0fdf4" : "#fef2f2", sub: gap <= 0 ? "Meta atingida!" : "ainda falta" },
            { label: "Projeção",     value: formatCurrency(projection),         color: projection >= goal.revenueGoal ? "#10b981" : "#f59e0b", bg: projection >= goal.revenueGoal ? "#f0fdf4" : "#fffbeb" },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl p-4 border border-gray-100" style={{ background: card.bg }}>
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className="text-xl font-bold" style={{ color: card.color }}>{card.value}</p>
              {card.sub && <p className="text-xs mt-0.5" style={{ color: card.color }}>{card.sub}</p>}
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progresso da meta</span>
            <span className="text-sm font-bold text-gray-800">{realizationPct.toFixed(0)}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${realizationPct}%`, background: realizationPct >= 100 ? "#10b981" : realizationPct >= 60 ? "#f59e0b" : "#6366f1" }}
            />
          </div>
        </div>
      </div>

      {/* Bloco desdobramento */}
      {(closingsNeeded > 0 || opportunitiesNeeded > 0 || leadsNeeded > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Desdobramento para bater a meta</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: "Fechamentos", value: closingsNeeded,      color: "#6366f1", hint: `ticket médio ${formatCurrency(goal.averageTicketGoal)}` },
              { label: "Oportunidades", value: opportunitiesNeeded, color: "#f59e0b", hint: `tx. fechamento ${goal.closingRateGoal}%` },
              { label: "Leads",       value: leadsNeeded,          color: "#10b981", hint: `tx. qualificação ${goal.qualificationRateGoal}%` },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-3xl font-bold mb-1" style={{ color: c.color }}>{c.value}</p>
                <p className="text-sm font-medium text-gray-700">{c.label} necessários</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funil + Conversões */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Funil de Vendas</h3>
          </div>
          <div className="space-y-2.5">
            {funnel.map(({ stage, count }) => {
              const stg  = stages.find((s) => s.id === stage);
              const pct  = (count / maxFunnelCount) * 100;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-32 text-right shrink-0">{stg?.label ?? stage}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${count > 0 ? Math.max(pct, 6) : 0}%`, background: stg?.color ?? "#6366f1" }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-5 text-right shrink-0">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversões */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Conversões entre Etapas</h3>
          </div>
          <div className="space-y-3">
            {conversions.map(({ from, to, rate }) => {
              const fromLabel = stages.find((s) => s.id === from)?.label ?? from;
              const toLabel   = stages.find((s) => s.id === to)?.label ?? to;
              return (
                <div key={`${from}-${to}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">{fromLabel} → {toLabel}</span>
                    <span className="text-xs font-bold text-gray-800">{rate.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${rate}%`, background: rate >= 50 ? "#10b981" : rate >= 25 ? "#f59e0b" : "#ef4444" }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Conversão Geral (Lead → Fechado)</span>
              <span className="text-base font-bold" style={{ color: overallConversion >= 20 ? "#10b981" : "#6366f1" }}>
                {overallConversion.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Por Origem */}
      {bySource.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Por Origem</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Origem</th>
                  <th className="text-right pb-2 font-medium">Leads</th>
                  <th className="text-right pb-2 font-medium">Fechados</th>
                  <th className="text-right pb-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bySource.map(({ source, leads, closings, revenue }) => (
                  <tr key={source}>
                    <td className="py-2 font-medium text-gray-700">{source}</td>
                    <td className="py-2 text-right text-gray-600">{leads}</td>
                    <td className="py-2 text-right text-gray-600">{closings}</td>
                    <td className="py-2 text-right font-semibold text-indigo-600">{formatCurrency(revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gargalos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sem próxima ação */}
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-700">Sem próxima ação</h3>
            <span className="ml-auto text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {bottlenecks.withoutNextAction.length}
            </span>
          </div>
          {bottlenecks.withoutNextAction.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Tudo certo!</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {bottlenecks.withoutNextAction.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-medium truncate">{d.clientName}</span>
                  <span className="text-gray-400 ml-2 shrink-0">{stages.find((s) => s.id === d.stage)?.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Propostas sem follow-up */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-blue-700">Propostas sem follow-up (3d+)</h3>
            <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {bottlenecks.proposalsWithoutFollowUp.length}
            </span>
          </div>
          {bottlenecks.proposalsWithoutFollowUp.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Tudo certo!</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {bottlenecks.proposalsWithoutFollowUp.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-medium truncate">{d.clientName}</span>
                  <span className="text-gray-400 shrink-0">{daysSince(d.updatedAt)}d atrás</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calls sem retorno */}
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-orange-700">Calls sem retorno (3d+)</h3>
            <span className="ml-auto text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              {bottlenecks.callsWithoutReturn.length}
            </span>
          </div>
          {bottlenecks.callsWithoutReturn.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Tudo certo!</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {bottlenecks.callsWithoutReturn.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-medium truncate">{d.clientName}</span>
                  <span className="text-gray-400 shrink-0">{daysSince(d.updatedAt)}d atrás</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Perdidos por objeção */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <X className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-red-700">Perdidos por objeção</h3>
            <span className="ml-auto text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {bottlenecks.lostByObjection.reduce((s, o) => s + o.count, 0)}
            </span>
          </div>
          {bottlenecks.lostByObjection.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Sem perdas registradas.</p>
          ) : (
            <div className="space-y-2.5 max-h-40 overflow-y-auto">
              {bottlenecks.lostByObjection.map(({ objection, count }) => {
                const maxCount = bottlenecks.lostByObjection[0].count;
                return (
                  <div key={objection}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs text-gray-700 truncate">{objection}</span>
                      <span className="text-xs font-bold text-red-600 ml-2 shrink-0">{count}</span>
                    </div>
                    <div className="h-1 bg-red-50 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── MetasTab ─────────────────────────────────────────────────────────────────

const EMPTY_GOAL = (m: number, y: number): GoalData => ({
  month: m, year: y,
  revenueGoal: 0, newClientsGoal: 0, leadsGoal: 0, conversionGoal: 0,
  averageTicketGoal: 0, closingRateGoal: 0, qualificationRateGoal: 0,
  weeksPerMonth: 4, businessDaysPerWeek: 5,
  notes: "", items: [],
});

function calcBreakdown(goal: GoalData) {
  const { revenueGoal, averageTicketGoal, closingRateGoal, weeksPerMonth, businessDaysPerWeek } = goal;
  if (revenueGoal <= 0 || averageTicketGoal <= 0 || closingRateGoal <= 0) return null;
  const rate = closingRateGoal / 100;
  const weeks = weeksPerMonth > 0 ? weeksPerMonth : 4;
  const days  = businessDaysPerWeek > 0 ? businessDaysPerWeek : 5;

  const salesNeeded                 = revenueGoal / averageTicketGoal;
  const monthlyConversationsNeeded  = salesNeeded / rate;
  const weeklyConversationsNeeded   = monthlyConversationsNeeded / weeks;
  const dailyConversationsNeeded    = weeklyConversationsNeeded / days;

  return {
    salesNeeded,
    monthlyConversationsNeeded,
    weeklyConversationsNeeded,
    dailyConversationsNeeded,
    salesNeededRounded:                Math.ceil(salesNeeded),
    monthlyConversationsRounded:       Math.ceil(monthlyConversationsNeeded),
    weeklyConversationsRounded:        Math.ceil(weeklyConversationsNeeded),
    dailyConversationsRounded:         Math.ceil(dailyConversationsNeeded),
  };
}

function MetasTab() {
  const now = new Date();
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [goal,    setGoal]    = useState<GoalData>(EMPTY_GOAL(now.getMonth() + 1, now.getFullYear()));
  const [results, setResults] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    const [goalRes, resRes] = await Promise.all([
      fetch(`/api/crm/metas?month=${m}&year=${y}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/crm/metas/resultados?month=${m}&year=${y}`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    setGoal(goalRes ? { ...EMPTY_GOAL(m, y), ...goalRes } : EMPTY_GOAL(m, y));
    setResults(resRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(month, year); }, [month, year, load]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const addItem    = () => setGoal((g) => ({ ...g, items: [...g.items, { label: "", quantity: 1, unitPrice: 0 }] }));
  const removeItem = (i: number) => setGoal((g) => ({ ...g, items: g.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, field: keyof GoalItemData, val: string | number) =>
    setGoal((g) => ({ ...g, items: g.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/crm/metas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...goal, month, year }),
      });
      if (res.ok) {
        const updated = await res.json();
        setGoal({ ...EMPTY_GOAL(month, year), ...updated });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const itemsTotal  = goal.items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0);
  const breakdown   = calcBreakdown(goal);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Nav mês */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-bold text-gray-800 min-w-[160px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{ background: saved ? "#10b981" : "#6366f1" }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Salvo!" : "Salvar metas"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna esquerda: definição */}
        <div className="space-y-5">

          {/* Inputs principais da meta */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Parâmetros da Meta</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Meta mensal de faturamento (R$)</label>
                <input
                  type="number"
                  value={goal.revenueGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, revenueGoal: parseFloat(e.target.value) || 0 }))}
                  placeholder="Ex: 30000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ticket do produto (R$)</label>
                <input
                  type="number"
                  value={goal.averageTicketGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, averageTicketGoal: parseFloat(e.target.value) || 0 }))}
                  placeholder="Ex: 2400"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Taxa de conversão (%)</label>
                <input
                  type="number"
                  value={goal.closingRateGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, closingRateGoal: parseFloat(e.target.value) || 0 }))}
                  placeholder="Ex: 30"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Semanas comerciais/mês</label>
                <input
                  type="number"
                  value={goal.weeksPerMonth || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, weeksPerMonth: parseInt(e.target.value) || 4 }))}
                  placeholder="4"
                  min={1} max={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Dias úteis/semana</label>
                <input
                  type="number"
                  value={goal.businessDaysPerWeek || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, businessDaysPerWeek: parseInt(e.target.value) || 5 }))}
                  placeholder="5"
                  min={1} max={7}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Desdobramento operacional */}
          {breakdown ? (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-indigo-800 uppercase tracking-wide">Desdobramento Operacional</h3>
              </div>

              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                <span>Métrica</span>
                <span className="text-center">Exato</span>
                <span className="text-center">Operacional ↑</span>
              </div>

              <div className="space-y-1">
                {[
                  {
                    label: "Vendas necessárias / mês",
                    exact: breakdown.salesNeeded,
                    rounded: breakdown.salesNeededRounded,
                    color: "#6366f1",
                    bg: "#eef2ff",
                    decimals: 1,
                    suffix: "",
                  },
                  {
                    label: "Conversas necessárias / mês",
                    exact: breakdown.monthlyConversationsNeeded,
                    rounded: breakdown.monthlyConversationsRounded,
                    color: "#8b5cf6",
                    bg: "#f5f3ff",
                    decimals: 1,
                    suffix: "",
                  },
                  {
                    label: "Conversas / semana",
                    exact: breakdown.weeklyConversationsNeeded,
                    rounded: breakdown.weeklyConversationsRounded,
                    color: "#3b82f6",
                    bg: "#eff6ff",
                    decimals: 2,
                    suffix: "",
                  },
                  {
                    label: "Conversas / dia",
                    exact: breakdown.dailyConversationsNeeded,
                    rounded: breakdown.dailyConversationsRounded,
                    color: "#10b981",
                    bg: "#f0fdf4",
                    decimals: 2,
                    suffix: "",
                  },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-3 gap-2 items-center rounded-xl px-3 py-2.5" style={{ background: row.bg }}>
                    <span className="text-xs text-gray-600 font-medium leading-tight">{row.label}</span>
                    <span className="text-sm text-gray-500 text-center tabular-nums">
                      {row.exact.toFixed(row.decimals)}{row.suffix}
                    </span>
                    <span className="text-base font-bold text-center tabular-nums" style={{ color: row.color }}>
                      {row.rounded}{row.suffix}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-indigo-100 text-xs text-indigo-500 text-center">
                {formatCurrency(goal.revenueGoal)} ÷ {formatCurrency(goal.averageTicketGoal)} × {goal.closingRateGoal}% conversão
                &nbsp;·&nbsp;{goal.weeksPerMonth} sem/mês · {goal.businessDaysPerWeek} dias/sem
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <Target className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Preencha a meta mensal, o ticket do produto e a taxa de conversão para ver o desdobramento operacional.</p>
            </div>
          )}

          {/* Outras metas de volume */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Outras Metas</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Novos Alunos",          field: "newClientsGoal" as keyof GoalData, type: "int",   placeholder: "0" },
                { label: "Leads no mês",           field: "leadsGoal"      as keyof GoalData, type: "int",   placeholder: "0" },
                { label: "Conversão real alvo (%)", field: "conversionGoal" as keyof GoalData, type: "float", placeholder: "0" },
                { label: "Taxa de qualificação (%)", field: "qualificationRateGoal" as keyof GoalData, type: "float", placeholder: "0" },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    type="number"
                    value={(goal[field] as number) || ""}
                    onChange={(e) => setGoal((g) => ({
                      ...g,
                      [field]: type === "int" ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0,
                    }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Desdobramento por produto */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Desdobramento por Produto</h3>
              <button onClick={addItem} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                <Plus className="w-3.5 h-3.5" />Adicionar linha
              </button>
            </div>
            {goal.items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Adicione produtos ou serviços para desdobrar a meta de faturamento.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1">
                  <span className="col-span-5">Produto / Serviço</span>
                  <span className="col-span-2 text-center">Qtd</span>
                  <span className="col-span-3 text-right">Preço unit.</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>
                {goal.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.label} onChange={(e) => updateItem(i, "label", e.target.value)} placeholder="Ex: Consultoria Premium"
                      className="col-span-5 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    <input type="number" value={item.quantity || ""} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)} placeholder="1"
                      className="col-span-2 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-indigo-400" />
                    <input type="number" value={item.unitPrice || ""} onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)} placeholder="0"
                      className="col-span-3 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-right focus:outline-none focus:border-indigo-400" />
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className="text-xs font-semibold text-gray-700 truncate">{formatCurrency(item.quantity * item.unitPrice)}</span>
                      <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-2 flex justify-between items-center px-1">
                  <span className="text-xs text-gray-500 font-medium">Total desdobramento</span>
                  <span className="text-base font-bold text-gray-800">{formatCurrency(itemsTotal)}</span>
                </div>
                {goal.revenueGoal > 0 && Math.abs(itemsTotal - goal.revenueGoal) > 0.01 && (
                  <div className="text-xs rounded-lg px-3 py-2 text-center"
                    style={{ background: itemsTotal < goal.revenueGoal ? "#fef3c7" : "#dcfce7", color: itemsTotal < goal.revenueGoal ? "#92400e" : "#166534" }}>
                    {itemsTotal < goal.revenueGoal
                      ? `Faltam ${formatCurrency(goal.revenueGoal - itemsTotal)} para atingir a meta`
                      : `Desdobramento ${formatCurrency(itemsTotal - goal.revenueGoal)} acima da meta`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Observações</h3>
            <textarea
              value={goal.notes ?? ""}
              onChange={(e) => setGoal((g) => ({ ...g, notes: e.target.value }))}
              placeholder="Contexto do mês, estratégias, lembretes..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
            />
          </div>
        </div>

        {/* Coluna direita: resultado real */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5">Real vs Meta</h3>
            {results ? (
              <div className="space-y-5">
                <ProgressBar label="Faturamento"       value={results.revenue}        goal={goal.revenueGoal}    format="currency" />
                <ProgressBar label="Novos Alunos"      value={results.newClients}     goal={goal.newClientsGoal} format="number"   />
                <ProgressBar label="Leads"             value={results.leadsCount}     goal={goal.leadsGoal}      format="number"   />
                <ProgressBar label="Taxa de Conversão" value={results.conversionRate} goal={goal.conversionGoal} format="percent"  />
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Sem dados de resultado para este mês.</p>
            )}
          </div>
          {results && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Receita no mês", value: formatCurrency(results.revenue),          color: "#10b981", bg: "#f0fdf4" },
                { label: "Leads captados", value: String(results.leadsCount),                color: "#6366f1", bg: "#eef2ff" },
                { label: "Novos alunos",   value: String(results.newClients),                color: "#f59e0b", bg: "#fffbeb" },
                { label: "Conversão real", value: `${results.conversionRate.toFixed(1)}%`,   color: "#3b82f6", bg: "#eff6ff" },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl p-4 border border-gray-100" style={{ background: card.bg }}>
                  <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                  <p className="text-xl font-bold" style={{ color: card.color }}>{card.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main CRMPage ─────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [activeTab,    setActiveTab]    = useState<"pipeline" | "dashboard" | "metas">("pipeline");
  const [deals,        setDeals]        = useState<Deal[]>([]);
  const [clients,      setClients]      = useState<Client[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dragging,     setDragging]     = useState<string | null>(null);
  const [dragOver,     setDragOver]     = useState<string | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [editDeal,     setEditDeal]     = useState<Deal | null>(null);
  const [form,         setForm]         = useState<FormState>(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [menuOpen,     setMenuOpen]     = useState<string | null>(null);
  const [convertDeal,  setConvertDeal]  = useState<Deal | null>(null);
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());
  const [quickFilter,  setQuickFilter]  = useState<"all" | "no_action" | "stuck">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [dealsRes, clientsRes] = await Promise.all([
      fetch("/api/crm/deals"),
      fetch("/api/crm/clients"),
    ]);
    setDeals(await dealsRes.json());
    setClients(await clientsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredDeals  = deals.filter((d) => {
    if (quickFilter === "no_action") return !d.nextAction && !["fechado","perdido"].includes(d.stage);
    if (quickFilter === "stuck")     return daysSince(d.updatedAt) >= 3 && !["fechado","perdido"].includes(d.stage);
    return true;
  });
  const dealsByStage = (stageId: string) => filteredDeals.filter((d) => d.stage === stageId);

  const handleDrop = async (stageId: string) => {
    if (!dragging) return;
    const deal = deals.find((d) => d.id === dragging);
    if (!deal || deal.stage === stageId) { setDragging(null); setDragOver(null); return; }
    setDeals((prev) => prev.map((d) => d.id === dragging ? { ...d, stage: stageId } : d));
    setDragging(null);
    setDragOver(null);
    await fetch(`/api/crm/deals/${dragging}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: stageId }),
    });
    if (stageId === "fechado" && !convertedIds.has(deal.id)) {
      setConvertDeal(deal);
    }
  };

  const openNew = (stage = "novo_lead") => {
    setEditDeal(null);
    setForm({ ...emptyForm, stage });
    setShowForm(true);
  };

  const openEdit = (deal: Deal) => {
    setEditDeal(deal);
    setForm({
      title: deal.title, clientId: deal.client.id, clientName: deal.client.name,
      clientEmail: deal.client.email || "", clientPhone: deal.client.phone || "",
      clientInstagram: deal.client.instagram || "",
      value: deal.value ? String(deal.value) : "",
      potentialValue: deal.potentialValue ? String(deal.potentialValue) : "",
      closedValue: deal.closedValue ? String(deal.closedValue) : "",
      stage: deal.stage, priority: deal.priority,
      nextAction: deal.nextAction || "", notes: deal.notes || "",
      objection: deal.objection || "",
      source: deal.source || "", funnel: deal.funnel || "", objectives: deal.objectives || "",
      firstContact: deal.firstContact ? deal.firstContact.split("T")[0] : new Date().toISOString().split("T")[0],
    });
    setMenuOpen(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || (!editDeal && !form.clientId && !form.clientName)) return;
    setSaving(true);
    const payload = { ...form };
    if (editDeal) {
      const res = await fetch(`/api/crm/deals/${editDeal.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const updated = await res.json();
      setDeals((prev) => prev.map((d) => d.id === editDeal.id ? { ...d, ...updated } : d));
    } else {
      const res = await fetch("/api/crm/deals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const deal = await res.json();
      setDeals((prev) => [deal, ...prev]);
      if (!clients.find((c) => c.id === deal.client.id)) {
        setClients((prev) => [deal.client, ...prev]);
      }
    }
    setShowForm(false);
    setEditDeal(null);
    setForm(emptyForm);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setMenuOpen(null);
    await fetch(`/api/crm/deals/${id}`, { method: "DELETE" });
  };

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM Comercial</h1>
          {activeTab === "pipeline" && (
            <p className="text-gray-500 text-sm mt-1">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} · pipeline{" "}
              <span className="font-semibold text-indigo-600">{formatCurrency(totalValue)}</span>
            </p>
          )}
        </div>
        {activeTab === "pipeline" && (
          <button
            onClick={() => openNew()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "#6366f1" }}
          >
            <Plus className="w-4 h-4" />
            Novo Lead
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: "pipeline",  label: "Pipeline" },
          { id: "dashboard", label: "Dashboard" },
          { id: "metas",     label: "Metas" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "pipeline" | "dashboard" | "metas")}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={activeTab === tab.id ? { background: "#6366f1", color: "#fff" } : { color: "#6b7280" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline */}
      {activeTab === "pipeline" && (
        loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        ) : (
          <>
            {/* Filtros rápidos */}
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              {[
                { id: "all"       as const, label: `Todos (${deals.filter((d) => !["fechado","perdido"].includes(d.stage)).length})` },
                { id: "no_action" as const, label: `Sem ação (${deals.filter((d) => !d.nextAction && !["fechado","perdido"].includes(d.stage)).length})`, color: "amber" },
                { id: "stuck"     as const, label: `Parados 3d+ (${deals.filter((d) => daysSince(d.updatedAt) >= 3 && !["fechado","perdido"].includes(d.stage)).length})`, color: "red" },
              ].map((f) => (
                <button key={f.id} onClick={() => setQuickFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    quickFilter === f.id
                      ? f.color === "amber" ? "bg-amber-500 text-white border-amber-500"
                      : f.color === "red"   ? "bg-red-500 text-white border-red-500"
                      : "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4 flex-1" onClick={() => setMenuOpen(null)}>
              {stages.map((stage) => {
                const stageDeals = dealsByStage(stage.id);
                const stageValue = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0);
                return (
                  <div
                    key={stage.id}
                    className="flex-shrink-0 w-72 rounded-xl flex flex-col transition-colors"
                    style={{ background: dragOver === stage.id ? "#e0e7ff" : "#f1f5f9" }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(stage.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleDrop(stage.id)}
                  >
                    <div className="px-3 py-3">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                          <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                          <span className="text-xs text-gray-400 bg-white rounded-full px-1.5 py-0.5">
                            {stageDeals.length}
                          </span>
                        </div>
                        <button onClick={() => openNew(stage.id)} className="text-gray-400 hover:text-indigo-500 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {stageValue > 0 && (
                        <p className="text-xs text-gray-400 pl-4">{formatCurrency(stageValue)}</p>
                      )}
                    </div>

                    <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
                      {stageDeals.length === 0 && (
                        <div className="text-center py-5 text-gray-300 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                          Solte um card aqui
                        </div>
                      )}
                      {stageDeals.map((deal) => {
                        const daysStuck = daysSince(deal.updatedAt);
                        const noAction  = !deal.nextAction && !["fechado","perdido"].includes(deal.stage);
                        const isStuck   = daysStuck >= 3 && !["fechado","perdido"].includes(deal.stage);
                        return (
                          <div
                            key={deal.id}
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); setDragging(deal.id); }}
                            onDragEnd={() => { setDragging(null); setDragOver(null); }}
                            className={`bg-white rounded-xl shadow-sm border transition-all cursor-grab active:cursor-grabbing ${
                              dragging === deal.id ? "opacity-40 scale-95"
                              : noAction ? "border-amber-200 hover:shadow-md"
                              : "border-gray-100 hover:shadow-md hover:border-indigo-100"
                            }`}
                          >
                            <div className="h-1 rounded-t-xl w-full" style={{ background: priorityColor[deal.priority] }} />
                            <div className="p-3">
                              <div className="flex items-start justify-between mb-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{deal.title}</p>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-xs font-medium text-indigo-600 truncate">{deal.client.name}</p>
                                    {isStuck && (
                                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                                        <Clock className="w-2.5 h-2.5" />{daysStuck}d
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="relative ml-2 flex-shrink-0">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === deal.id ? null : deal.id); }}
                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                  {menuOpen === deal.id && (
                                    <div className="absolute right-0 top-7 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1 w-36">
                                      <button onClick={(e) => { e.stopPropagation(); openEdit(deal); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                                        <Pencil className="w-3.5 h-3.5 text-indigo-400" />Editar
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); handleDelete(deal.id); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50">
                                        <Trash2 className="w-3.5 h-3.5" />Excluir
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {(deal.closedValue || deal.value) ? (
                                <p className="text-base font-bold text-gray-900 mb-2">
                                  {formatCurrency(deal.closedValue ?? deal.value ?? 0)}
                                  {deal.closedValue && deal.value && deal.closedValue !== deal.value && (
                                    <span className="text-xs font-normal text-gray-400 ml-1">
                                      (potencial {formatCurrency(deal.value)})
                                    </span>
                                  )}
                                </p>
                              ) : null}

                              <div className="space-y-1 mb-2">
                                {deal.source && (
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                    <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                                    <span className="truncate">{deal.source}</span>
                                    {deal.funnel && <><span className="text-gray-300">·</span><span className="truncate text-gray-400">{deal.funnel}</span></>}
                                  </div>
                                )}
                                {deal.objectives && (
                                  <div className="flex items-start gap-1.5 text-xs text-gray-500">
                                    <Target className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">{deal.objectives}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                  <Calendar className="w-3 h-3 text-gray-300 flex-shrink-0" />
                                  <span>{formatDate(deal.firstContact)}</span>
                                </div>
                              </div>

                              {deal.nextAction ? (
                                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5 mb-2 truncate">
                                  → {deal.nextAction}
                                </p>
                              ) : !["fechado","perdido"].includes(deal.stage) && (
                                <p className="text-xs text-red-400 bg-red-50 rounded-lg px-2 py-1.5 mb-2 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" /> Sem próxima ação
                                </p>
                              )}

                              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor[deal.priority] }} />
                                  <span className="text-xs text-gray-400">{priorityLabel[deal.priority]}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {deal.client.phone && (
                                    <a href={`https://wa.me/${deal.client.phone.replace(/\D/g, "")}`}
                                      target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="text-gray-300 hover:text-green-500 transition-colors">
                                      <Phone className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {deal.client.email && (
                                    <a href={`mailto:${deal.client.email}`} onClick={(e) => e.stopPropagation()}
                                      className="text-gray-300 hover:text-indigo-500 transition-colors">
                                      <Mail className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      )}

      {/* Dashboard */}
      {activeTab === "dashboard" && <DashboardTab />}

      {/* Metas */}
      {activeTab === "metas" && <MetasTab />}

      {/* Modal conversão CRM → Aluno */}
      {convertDeal && (
        <ConvertModal
          deal={convertDeal}
          onClose={() => setConvertDeal(null)}
          onDone={() => {
            setConvertedIds((prev) => new Set([...prev, convertDeal.id]));
            setDeals((prev) => prev.map((d) => d.id === convertDeal.id ? { ...d, stage: "fechado" } : d));
            setConvertDeal(null);
          }}
        />
      )}

      {/* Modal criar / editar */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => { setShowForm(false); setEditDeal(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {editDeal ? "Editar Lead" : "Novo Lead"}
            </h2>
            <DealForm form={form} setForm={setForm} clients={clients} isEdit={!!editDeal} />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowForm(false); setEditDeal(null); setForm(emptyForm); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title || (!editDeal && !form.clientId && !form.clientName)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                style={{ background: "#6366f1" }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editDeal ? "Salvar alterações" : "Criar lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

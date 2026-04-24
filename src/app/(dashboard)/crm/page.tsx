"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Phone, Mail, MoreHorizontal, Loader2, Trash2, Pencil,
  MapPin, Target, Calendar, ChevronLeft, ChevronRight, Save, X,
  UserPlus, CreditCard,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

// ─── CRM types ───────────────────────────────────────────────────────────────

const stages = [
  { id: "lead",      label: "Lead",         color: "#6366f1" },
  { id: "prospect",  label: "Prospect",     color: "#f59e0b" },
  { id: "proposta",  label: "Proposta",     color: "#3b82f6" },
  { id: "contrato",  label: "Contrato",     color: "#8b5cf6" },
  { id: "andamento", label: "Em Andamento", color: "#10b981" },
  { id: "concluido", label: "Concluído",    color: "#64748b" },
];

const sourceOptions = [
  "Instagram", "WhatsApp", "Indicação", "Google", "Facebook",
  "TikTok", "YouTube", "Site", "Evento", "Outro",
];

const funnelOptions = [
  "Orgânico", "Funil de E-mail", "Funil de WhatsApp", "Stories",
  "Anúncio Pago", "Parceria", "Webinar", "Outro",
];

const priorityColor = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };
const priorityLabel = { low: "Baixa", medium: "Média", high: "Alta" };

const PAYMENT_METHODS = ["Pix", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Transferência", "Dinheiro"];

type ServicePlan = { id: string; name: string; totalAmount: number; installments: number };

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

type Client = { id: string; name: string; phone?: string | null; email?: string | null };
type Deal = {
  id: string; title: string; value?: number | null; stage: string;
  priority: "low" | "medium" | "high"; nextAction?: string | null;
  notes?: string | null; source?: string | null; funnel?: string | null;
  objectives?: string | null; firstContact: string; client: Client;
};

type GoalItemData = { id?: string; label: string; quantity: number; unitPrice: number };
type GoalData = {
  id?: string; month: number; year: number;
  revenueGoal: number; newClientsGoal: number; leadsGoal: number; conversionGoal: number;
  notes: string; items: GoalItemData[];
};
type ResultData = { revenue: number; leadsCount: number; conversionRate: number; newClients: number };

// ─── DealForm ────────────────────────────────────────────────────────────────

const emptyForm = {
  title: "", clientId: "", clientName: "", clientEmail: "", clientPhone: "",
  value: "", stage: "lead", priority: "medium", nextAction: "", notes: "",
  source: "", funnel: "", objectives: "",
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
      <div className="grid grid-cols-3 gap-3">
        <input
          placeholder="Valor (R$)"
          value={form.value}
          onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
        />
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
          <span className="font-semibold text-gray-800">{fmt(value)}</span>
          {" / "}
          {fmt(goal)}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
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
    totalAmount:   deal.value ? String(deal.value) : "",
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
    setSaving(true);
    const body: Record<string, unknown> = {
      name:  deal.client.name,
      email: deal.client.email ?? "",
      phone: deal.client.phone ?? "",
    };
    if (payment.totalAmount && parseFloat(payment.totalAmount) > 0) {
      body.payment = {
        description:   payment.description,
        totalAmount:   parseFloat(payment.totalAmount),
        installments:  parseInt(payment.installments) || 1,
        paymentMethod: payment.paymentMethod || null,
        firstDueDate:  payment.firstDueDate,
      };
    }
    await fetch("/api/alunos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

// ─── MetasTab ─────────────────────────────────────────────────────────────────

function MetasTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [goal,  setGoal]  = useState<GoalData>({
    month, year,
    revenueGoal: 0, newClientsGoal: 0, leadsGoal: 0, conversionGoal: 0,
    notes: "", items: [],
  });
  const [results, setResults] = useState<ResultData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    const [goalRes, resRes] = await Promise.all([
      fetch(`/api/crm/metas?month=${m}&year=${y}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/crm/metas/resultados?month=${m}&year=${y}`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    setGoal(goalRes ?? {
      month: m, year: y,
      revenueGoal: 0, newClientsGoal: 0, leadsGoal: 0, conversionGoal: 0,
      notes: "", items: [],
    });
    setResults(resRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(month, year); }, [month, year, load]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const addItem = () => {
    setGoal((g) => ({ ...g, items: [...g.items, { label: "", quantity: 1, unitPrice: 0 }] }));
  };

  const removeItem = (i: number) => {
    setGoal((g) => ({ ...g, items: g.items.filter((_, idx) => idx !== i) }));
  };

  const updateItem = (i: number, field: keyof GoalItemData, val: string | number) => {
    setGoal((g) => ({
      ...g,
      items: g.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item),
    }));
  };

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
        setGoal(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const itemsTotal = goal.items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Navegação mês/ano */}
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
        {/* Coluna esquerda: definição das metas */}
        <div className="space-y-5">
          {/* Metas principais */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Meta do Mês</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Faturamento (R$)</label>
                <input
                  type="number"
                  value={goal.revenueGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, revenueGoal: parseFloat(e.target.value) || 0 }))}
                  placeholder="0,00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Novos Alunos</label>
                <input
                  type="number"
                  value={goal.newClientsGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, newClientsGoal: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Leads</label>
                <input
                  type="number"
                  value={goal.leadsGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, leadsGoal: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Taxa de Conversão (%)</label>
                <input
                  type="number"
                  value={goal.conversionGoal || ""}
                  onChange={(e) => setGoal((g) => ({ ...g, conversionGoal: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Desdobramento por produto/serviço */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Desdobramento</h3>
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar linha
              </button>
            </div>

            {goal.items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                Adicione produtos ou serviços para desdobrar a meta de faturamento.
              </p>
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
                    <input
                      value={item.label}
                      onChange={(e) => updateItem(i, "label", e.target.value)}
                      placeholder="Ex: Consultoria Premium"
                      className="col-span-5 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)}
                      placeholder="1"
                      className="col-span-2 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      type="number"
                      value={item.unitPrice || ""}
                      onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="col-span-3 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-right focus:outline-none focus:border-indigo-400"
                    />
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className="text-xs font-semibold text-gray-700 truncate">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </span>
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

                {goal.revenueGoal > 0 && itemsTotal !== goal.revenueGoal && (
                  <div
                    className="text-xs rounded-lg px-3 py-2 text-center"
                    style={{
                      background: Math.abs(itemsTotal - goal.revenueGoal) < 0.01 ? "#dcfce7" : "#fef3c7",
                      color: Math.abs(itemsTotal - goal.revenueGoal) < 0.01 ? "#166534" : "#92400e",
                    }}
                  >
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
                <ProgressBar
                  label="Faturamento"
                  value={results.revenue}
                  goal={goal.revenueGoal}
                  format="currency"
                />
                <ProgressBar
                  label="Novos Alunos"
                  value={results.newClients}
                  goal={goal.newClientsGoal}
                  format="number"
                />
                <ProgressBar
                  label="Leads"
                  value={results.leadsCount}
                  goal={goal.leadsGoal}
                  format="number"
                />
                <ProgressBar
                  label="Taxa de Conversão"
                  value={results.conversionRate}
                  goal={goal.conversionGoal}
                  format="percent"
                />
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Sem dados de resultado para este mês.</p>
            )}
          </div>

          {/* Cards de resumo */}
          {results && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Receita no mês",  value: formatCurrency(results.revenue),       color: "#10b981", bg: "#f0fdf4" },
                { label: "Leads captados",  value: String(results.leadsCount),             color: "#6366f1", bg: "#eef2ff" },
                { label: "Novos alunos",    value: String(results.newClients),             color: "#f59e0b", bg: "#fffbeb" },
                { label: "Conversão real",  value: `${results.conversionRate.toFixed(1)}%`, color: "#3b82f6", bg: "#eff6ff" },
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
  const [activeTab,     setActiveTab]     = useState<"pipeline" | "metas">("pipeline");
  const [deals,         setDeals]         = useState<Deal[]>([]);
  const [clients,       setClients]       = useState<Client[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [dragging,      setDragging]      = useState<string | null>(null);
  const [dragOver,      setDragOver]      = useState<string | null>(null);
  const [showForm,      setShowForm]      = useState(false);
  const [editDeal,      setEditDeal]      = useState<Deal | null>(null);
  const [form,          setForm]          = useState<FormState>(emptyForm);
  const [saving,        setSaving]        = useState(false);
  const [menuOpen,      setMenuOpen]      = useState<string | null>(null);
  const [convertDeal,   setConvertDeal]   = useState<Deal | null>(null);
  const [convertedIds,  setConvertedIds]  = useState<Set<string>>(new Set());

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

  const dealsByStage = (stageId: string) => deals.filter((d) => d.stage === stageId);

  const handleDrop = async (stageId: string) => {
    if (!dragging) return;
    const deal = deals.find((d) => d.id === dragging);
    if (!deal || deal.stage === stageId) { setDragging(null); setDragOver(null); return; }
    setDeals((prev) => prev.map((d) => d.id === dragging ? { ...d, stage: stageId } : d));
    setDragging(null);
    setDragOver(null);
    await fetch(`/api/crm/deals/${dragging}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: stageId }),
    });
    // Sugerir conversão ao mover para contrato ou andamento
    if ((stageId === "contrato" || stageId === "andamento") && !convertedIds.has(deal.id)) {
      setConvertDeal(deal);
    }
  };

  const openNew = (stage = "lead") => {
    setEditDeal(null);
    setForm({ ...emptyForm, stage });
    setShowForm(true);
  };

  const openEdit = (deal: Deal) => {
    setEditDeal(deal);
    setForm({
      title: deal.title, clientId: deal.client.id, clientName: deal.client.name,
      clientEmail: deal.client.email || "", clientPhone: deal.client.phone || "",
      value: deal.value ? String(deal.value) : "", stage: deal.stage, priority: deal.priority,
      nextAction: deal.nextAction || "", notes: deal.notes || "",
      source: deal.source || "", funnel: deal.funnel || "", objectives: deal.objectives || "",
      firstContact: deal.firstContact ? deal.firstContact.split("T")[0] : new Date().toISOString().split("T")[0],
    });
    setMenuOpen(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || (!editDeal && !form.clientId && !form.clientName)) return;
    setSaving(true);
    if (editDeal) {
      const res = await fetch(`/api/crm/deals/${editDeal.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const updated = await res.json();
      setDeals((prev) => prev.map((d) => d.id === editDeal.id ? { ...d, ...updated } : d));
    } else {
      const res = await fetch("/api/crm/deals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          {activeTab === "pipeline" && (
            <p className="text-gray-500 text-sm mt-1">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} · pipeline total{" "}
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
          { id: "pipeline", label: "Pipeline" },
          { id: "metas",    label: "Metas do Mês" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "pipeline" | "metas")}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={activeTab === tab.id
              ? { background: "#6366f1", color: "#fff" }
              : { color: "#6b7280" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline tab */}
      {activeTab === "pipeline" && (
        loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div
            className="flex gap-4 overflow-x-auto pb-4 flex-1"
            onClick={() => setMenuOpen(null)}
          >
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
                    {stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDragging(deal.id); }}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        className={`bg-white rounded-xl shadow-sm border transition-all cursor-grab active:cursor-grabbing ${dragging === deal.id ? "opacity-40 scale-95" : "border-gray-100 hover:shadow-md hover:border-indigo-100"}`}
                      >
                        <div className="h-1 rounded-t-xl w-full" style={{ background: priorityColor[deal.priority] }} />
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-800 truncate">{deal.title}</p>
                              <p className="text-xs font-medium text-indigo-600 truncate">{deal.client.name}</p>
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
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEdit(deal); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                                    Editar
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(deal.id); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Excluir
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {deal.value ? (
                            <p className="text-base font-bold text-gray-900 mb-2">
                              {formatCurrency(deal.value)}
                            </p>
                          ) : null}

                          <div className="space-y-1 mb-2">
                            {deal.source && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                                <span className="truncate">{deal.source}</span>
                                {deal.funnel && <span className="text-gray-300">·</span>}
                                {deal.funnel && <span className="truncate text-gray-400">{deal.funnel}</span>}
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

                          {deal.nextAction && (
                            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5 mb-2 truncate">
                              → {deal.nextAction}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor[deal.priority] }} />
                              <span className="text-xs text-gray-400">{priorityLabel[deal.priority]}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {deal.client.phone && (
                                <a
                                  href={`https://wa.me/${deal.client.phone.replace(/\D/g, "")}`}
                                  target="_blank" rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-gray-300 hover:text-green-500 transition-colors"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {deal.client.email && (
                                <a
                                  href={`mailto:${deal.client.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-gray-300 hover:text-indigo-500 transition-colors"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Metas tab */}
      {activeTab === "metas" && <MetasTab />}

      {/* Modal conversão CRM → Aluno */}
      {convertDeal && (
        <ConvertModal
          deal={convertDeal}
          onClose={() => setConvertDeal(null)}
          onDone={() => {
            setConvertedIds((prev) => new Set([...prev, convertDeal.id]));
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
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
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

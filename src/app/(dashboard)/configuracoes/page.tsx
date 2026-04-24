"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Loader2, X, Check, Settings, CreditCard, Link } from "lucide-react";

type ServicePlan = {
  id: string; name: string; description?: string | null;
  totalAmount: number; installments: number; durationMonths: number; active: boolean;
};

const emptyPlan = { name: "", description: "", totalAmount: "", installments: "1", durationMonths: "1" };

// ─── PlanForm ─────────────────────────────────────────────────────

function PlanForm({ form, setForm }: {
  form: typeof emptyPlan;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyPlan>>;
}) {
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nome do plano *</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Consultoria Premium 3 meses" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
        <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Valor total (R$)</label>
          <input type="number" value={form.totalAmount} onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))} placeholder="0,00" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Parcelas</label>
          <input type="number" min="1" value={form.installments} onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Duração (meses)</label>
          <input type="number" min="1" value={form.durationMonths} onChange={(e) => setForm((f) => ({ ...f, durationMonths: e.target.value }))} className={inputCls} />
        </div>
      </div>
      {form.totalAmount && parseInt(form.installments) > 1 && (
        <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700">
          {form.installments}x de R$ {(parseFloat(form.totalAmount) / parseInt(form.installments)).toFixed(2)} — Total: R$ {parseFloat(form.totalAmount).toFixed(2)}
        </div>
      )}
    </div>
  );
}

// ─── ConfiguracoesPage ────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const [plans,     setPlans]     = useState<ServicePlan[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editPlan,  setEditPlan]  = useState<ServicePlan | null>(null);
  const [form,      setForm]      = useState(emptyPlan);
  const [saving,    setSaving]    = useState(false);
  const [gcal,      setGcal]      = useState<{ connected: boolean; authUrl?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [plansRes, gcalRes] = await Promise.all([
      fetch("/api/configuracoes/planos").then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/agenda/google").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    setPlans(Array.isArray(plansRes) ? plansRes : []);
    setGcal(gcalRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditPlan(null);
    setForm(emptyPlan);
    setShowForm(true);
  }

  function openEdit(plan: ServicePlan) {
    setEditPlan(plan);
    setForm({
      name:          plan.name,
      description:   plan.description ?? "",
      totalAmount:   String(plan.totalAmount),
      installments:  String(plan.installments),
      durationMonths: String(plan.durationMonths),
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.totalAmount) return;
    setSaving(true);
    const body = {
      name:          form.name,
      description:   form.description || null,
      totalAmount:   parseFloat(form.totalAmount),
      installments:  parseInt(form.installments) || 1,
      durationMonths: parseInt(form.durationMonths) || 1,
    };
    if (editPlan) {
      const res = await fetch(`/api/configuracoes/planos/${editPlan.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => p.id === editPlan.id ? updated : p));
    } else {
      const res = await fetch("/api/configuracoes/planos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const created = await res.json();
      setPlans((prev) => [...prev, created]);
    }
    setShowForm(false);
    setEditPlan(null);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/configuracoes/planos/${id}`, { method: "DELETE" });
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie planos e integrações do sistema</p>
      </div>

      {/* Planos de serviço */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-indigo-500" />
          <h2 className="text-base font-bold text-gray-800">Planos de Serviço</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Planos pré-configurados agilizam o cadastro de alunos — ao selecionar um plano, valor e parcelas são preenchidos automaticamente.
        </p>

        <div className="space-y-3 mb-4">
          {plans.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400 border border-dashed border-gray-200">
              Nenhum plano configurado ainda. Crie o primeiro abaixo.
            </div>
          )}
          {plans.map((plan) => (
            <div key={plan.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">{plan.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  R$ {plan.totalAmount.toFixed(2)} · {plan.installments}x de R$ {(plan.totalAmount / plan.installments).toFixed(2)} · {plan.durationMonths} {plan.durationMonths === 1 ? "mês" : "meses"}
                </p>
                {plan.description && <p className="text-xs text-gray-400">{plan.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(plan)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-500 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(plan.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "#6366f1" }}
        >
          <Plus className="w-4 h-4" /> Novo plano
        </button>
      </section>

      {/* Integrações */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Link className="w-5 h-5 text-indigo-500" />
          <h2 className="text-base font-bold text-gray-800">Integrações</h2>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50">
              <Settings className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Google Calendar</p>
              <p className="text-xs text-gray-400">
                {gcal?.connected ? "Conectado — eventos sincronizados automaticamente" : "Não conectado"}
              </p>
            </div>
          </div>
          {gcal?.connected ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <Check className="w-3.5 h-3.5" /> Conectado
            </div>
          ) : gcal?.authUrl ? (
            <a
              href={gcal.authUrl}
              className="flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg"
              style={{ background: "#6366f1" }}
            >
              Conectar
            </a>
          ) : (
            <span className="text-xs text-gray-400">Configure as variáveis de ambiente</span>
          )}
        </div>
      </section>

      {/* Modal plano */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowForm(false); setEditPlan(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editPlan ? "Editar plano" : "Novo plano"}</h2>
              <button onClick={() => { setShowForm(false); setEditPlan(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <PlanForm form={form} setForm={setForm} />
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowForm(false); setEditPlan(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.totalAmount}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "#6366f1" }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editPlan ? "Salvar" : "Criar plano"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, Upload,
  TrendingUp, TrendingDown, Wallet, Target, X, ChevronDown,
  LayoutGrid, CreditCard, Receipt, ListChecks, AlertCircle,
  CheckCircle2, Clock, Users, DollarSign,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────
type Tx = {
  id: string;
  type: "receita" | "despesa";
  description: string;
  amount: number;
  category: string;
  status: string;
  dueDate?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  clientId?: string | null;
  client?: { id: string; name: string } | null;
};

type Installment = {
  id: string;
  number: number;
  amount: number;
  dueDate: string;
  paidAt?: string | null;
  status: string;
  notes?: string | null;
};

type Sale = {
  id: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  negotiationNotes?: string | null;
  paymentMethod?: string | null;
  status: string;
  clientId: string;
  createdAt: string;
  client: { id: string; name: string };
  installments: Installment[];
};

type Client = { id: string; name: string };

// ─── Constants ───────────────────────────────────────────────────
const EXPENSE_CATS = ["Pessoal", "Ferramentas e Plataformas", "Conhecimento", "Impostos", "Equipamentos", "Tráfego Pago", "Marketing", "Estagiário", "Outros"];
const INCOME_CATS  = ["Consultoria", "Aulas Presenciais", "Mensalidade", "Outros"];
const PAYMENT_METHODS = ["Pix", "Débito", "Crédito", "Transferência", "Boleto", "Dinheiro"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

type TabKey = "fluxo" | "pagar" | "faturamento" | "parcelas";

// ─── Helpers ─────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth()+1).padStart(2,"0")}/${dt.getUTCFullYear()}`;
}
function fmtShort(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth()+1).padStart(2,"0")}`;
}
function isOverdue(status: string, dueDate?: string | null) {
  if (status === "pago") return false;
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}
function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function inMonth(d: Date, dateStr?: string | null) {
  if (!dateStr) return false;
  const dt = new Date(dateStr);
  return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth();
}

// ─── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status, type, dueDate, onClick }: { status: string; type: "receita"|"despesa"; dueDate?: string|null; onClick?: () => void }) {
  const paid = status === "pago";
  const over = isOverdue(status, dueDate);
  const label = paid ? (type === "receita" ? "RECEBIDO" : "PAGO") : over ? "VENCIDO" : (type === "receita" ? "A RECEBER" : "A PAGAR");
  const cls = paid ? "bg-green-100 text-green-700 hover:bg-green-200"
    : over ? "bg-red-100 text-red-600 hover:bg-red-200"
    : "bg-amber-100 text-amber-700 hover:bg-amber-200";
  return (
    <button onClick={onClick} className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${cls} ${onClick ? "cursor-pointer" : "cursor-default"}`}>
      {label}
    </button>
  );
}

// ─── Modal base ───────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 mt-0.5"><X className="w-5 h-5 text-gray-400"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Nova Despesa Modal ───────────────────────────────────────────
function NovaDespesaModal({ onClose, onSave }: { onClose: () => void; onSave: (tx: Tx) => void }) {
  const [form, setForm] = useState({
    description: "", amount: "", category: "Outros", paymentMethod: "Pix",
    status: "pendente", dueDate: new Date().toISOString().slice(0,10), notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/lancamentos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, type: "despesa", amount: parseFloat(form.amount.replace(",",".")) }),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <Modal title="Nova Conta a Pagar" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            placeholder="Ex: Conta de internet, Salário..." autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Valor *</label>
            <input required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
              placeholder="0,00" type="number" step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Vencimento</label>
            <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Forma de Pagamento</label>
            <select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="pendente">A PAGAR</option>
            <option value="pago">PAGO</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Observações</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{background:"#6366f1"}}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Nova Receita Modal ───────────────────────────────────────────
function NovaReceitaModal({ clients, onClose, onSave }: { clients: Client[]; onClose: () => void; onSave: (tx: Tx) => void }) {
  const [form, setForm] = useState({
    description: "", amount: "", category: "Consultoria", paymentMethod: "Pix",
    status: "pendente", dueDate: new Date().toISOString().slice(0,10), clientId: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/lancamentos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, type: "receita", amount: parseFloat(form.amount.replace(",",".")) }),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <Modal title="Novo Faturamento" subtitle="Receita avulsa sem parcelamento" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            placeholder="Ex: Consultoria mensal, Sessão avulsa..." autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente</label>
          <select value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">— Sem cliente vinculado —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Valor *</label>
            <input required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
              placeholder="0,00" type="number" step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Vencimento</label>
            <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {INCOME_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Forma de Recebimento</label>
            <select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="pendente">A RECEBER</option>
            <option value="pago">RECEBIDO</option>
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{background:"#6366f1"}}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Nova Venda (Parcelada) Modal ─────────────────────────────────
function NovaVendaModal({ clients, onClose, onSave }: { clients: Client[]; onClose: () => void; onSave: (sale: Sale) => void }) {
  const [form, setForm] = useState({
    description: "", totalAmount: "", installmentsCount: "1", paymentMethod: "Pix",
    clientId: "", firstDueDate: new Date().toISOString().slice(0,10), negotiationNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const count = Math.max(1, parseInt(form.installmentsCount) || 1);
  const total = parseFloat(form.totalAmount.replace(",",".")) || 0;
  const perParcela = count > 0 ? total / count : 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.totalAmount || !form.clientId) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/vendas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, totalAmount: total, installmentsCount: count }),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <Modal title="Nova Venda Parcelada" subtitle="Gera parcelas automaticamente" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente *</label>
          <select required value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">Selecione o cliente...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            placeholder="Ex: Pacote 3 meses, Programa anual..." autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Valor Total *</label>
            <input required value={form.totalAmount} onChange={e => setForm({...form, totalAmount: e.target.value})}
              placeholder="0,00" type="number" step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Parcelas</label>
            <input value={form.installmentsCount} onChange={e => setForm({...form, installmentsCount: e.target.value})}
              type="number" min="1" max="60"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
        </div>

        {/* Preview */}
        {total > 0 && (
          <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
            <p className="text-xs text-indigo-600 font-semibold">{count}x de {fmt(perParcela)}</p>
            <p className="text-xs text-indigo-400 mt-0.5">Total: {fmt(total)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">1ª Parcela em</label>
            <input type="date" value={form.firstDueDate} onChange={e => setForm({...form, firstDueDate: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Forma de Pagamento</label>
            <select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notas de Negociação</label>
          <textarea rows={2} value={form.negotiationNotes} onChange={e => setForm({...form, negotiationNotes: e.target.value})}
            placeholder="Condições, descontos, observações..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving || !form.clientId} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{background:"#6366f1"}}>
            {saving ? "Criando..." : `Criar ${count} parcela${count>1?"s":""}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Tab: Contas a Pagar ──────────────────────────────────────────
function ContasPagar({ txs, onToggle, onDelete, onAdd }: {
  txs: Tx[];
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAdd: (tx: Tx) => void;
}) {
  const [filter, setFilter] = useState<"todas"|"pendente"|"vencida"|"pago">("pendente");
  const [showModal, setShowModal] = useState(false);
  const despesas = txs.filter(t => t.type === "despesa");

  const vencidas = despesas.filter(t => t.status !== "pago" && t.dueDate && new Date(t.dueDate) < new Date());
  const pendentes = despesas.filter(t => t.status !== "pago" && !isOverdue(t.status, t.dueDate));
  const pagas     = despesas.filter(t => t.status === "pago");

  const filtered = filter === "todas" ? despesas
    : filter === "vencida" ? vencidas
    : filter === "pendente" ? despesas.filter(t => t.status !== "pago")
    : pagas;

  const totalPendente = despesas.filter(t => t.status !== "pago").reduce((s,t) => s+t.amount, 0);
  const totalVencido  = vencidas.reduce((s,t) => s+t.amount, 0);
  const totalPago     = pagas.reduce((s,t) => s+t.amount, 0);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500"/>
            <span className="text-xs text-gray-500">A Pagar</span>
          </div>
          <p className="text-xl font-bold text-amber-600">{fmt(totalPendente)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{despesas.filter(t => t.status !== "pago").length} lançamentos</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-500"/>
            <span className="text-xs text-gray-500">Vencidas</span>
          </div>
          <p className="text-xl font-bold text-red-600">{fmt(totalVencido)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{vencidas.length} lançamentos</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500"/>
            <span className="text-xs text-gray-500">Pagas (mês)</span>
          </div>
          <p className="text-xl font-bold text-green-600">{fmt(totalPago)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{pagas.length} lançamentos</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["pendente","vencida","pago","todas"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===f ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
              style={filter===f ? {background:"#6366f1"} : {}}>
              {f==="pendente"?"A Pagar":f==="vencida"?"Vencidas":f==="pago"?"Pagas":"Todas"}
            </button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{background:"#ef4444"}}>
          <Plus className="w-4 h-4"/> Nova Conta a Pagar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Vencimento</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Categoria</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Pagamento</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Valor</th>
              <th className="w-10"/>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-gray-400 text-sm">Nenhuma conta encontrada</td></tr>
            ) : filtered.sort((a,b) => {
              const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
              const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
              return da - db;
            }).map(tx => (
              <tr key={tx.id} className="border-t border-gray-50 hover:bg-gray-50/60 group">
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                  {fmtDate(tx.dueDate)}
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{tx.description}</p>
                  {tx.notes && <p className="text-xs text-gray-400 mt-0.5">{tx.notes}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tx.category}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{tx.paymentMethod || "—"}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={tx.status} type="despesa" dueDate={tx.dueDate}
                    onClick={() => onToggle(tx.id, tx.status === "pago" ? "pendente" : "pago")}/>
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{color: tx.status==="pago" ? "#16a34a" : "#dc2626"}}>
                  {fmt(tx.amount)}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => onDelete(tx.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-red-50">
                <td colSpan={5} className="px-4 py-3 text-sm font-bold text-red-700 uppercase">Total</td>
                <td className="px-4 py-3 text-right text-base font-bold text-red-700">
                  {fmt(filtered.reduce((s,t) => s+t.amount, 0))}
                </td>
                <td/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showModal && <NovaDespesaModal onClose={() => setShowModal(false)} onSave={tx => { onAdd(tx); setShowModal(false); }}/>}
    </div>
  );
}

// ─── Tab: Faturamento ─────────────────────────────────────────────
function Faturamento({ txs, sales, clients, onToggle, onDelete, onAddTx, onAddSale, monthDate }: {
  txs: Tx[];
  sales: Sale[];
  clients: Client[];
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAddTx: (tx: Tx) => void;
  onAddSale: (sale: Sale) => void;
  monthDate: Date;
}) {
  const [showType, setShowType] = useState<"receita"|"venda"|null>(null);
  const [filter, setFilter] = useState<"todas"|"pendente"|"pago">("todas");

  const receitas = txs.filter(t => t.type === "receita");
  const filtered = filter === "todas" ? receitas : receitas.filter(t => t.status === filter);

  const totalFaturado = receitas.reduce((s,t) => s+t.amount, 0);
  const totalRecebido = receitas.filter(t => t.status==="pago").reduce((s,t) => s+t.amount, 0);
  const totalPendente = totalFaturado - totalRecebido;

  // Sales summary for this month
  const salesThisMonth = sales.filter(s => inMonth(monthDate, s.createdAt));
  const totalVendas = salesThisMonth.reduce((s,sale) => s + sale.totalAmount, 0);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-indigo-500"/>
            <span className="text-xs text-gray-500">Faturado</span>
          </div>
          <p className="text-xl font-bold text-indigo-700">{fmt(totalFaturado)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{receitas.length} lançamentos</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500"/>
            <span className="text-xs text-gray-500">Recebido</span>
          </div>
          <p className="text-xl font-bold text-green-600">{fmt(totalRecebido)}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500"/>
            <span className="text-xs text-gray-500">A Receber</span>
          </div>
          <p className="text-xl font-bold text-amber-600">{fmt(totalPendente)}</p>
        </div>
        <div className="bg-white rounded-xl border border-purple-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-500"/>
            <span className="text-xs text-gray-500">Vendas (mês)</span>
          </div>
          <p className="text-xl font-bold text-purple-600">{fmt(totalVendas)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{salesThisMonth.length} vendas</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["todas","pendente","pago"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===f ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
              style={filter===f ? {background:"#6366f1"} : {}}>
              {f==="todas"?"Todas":f==="pendente"?"A Receber":"Recebidas"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowType("receita")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{background:"#10b981"}}>
            <Plus className="w-4 h-4"/> Receita Avulsa
          </button>
          <button onClick={() => setShowType("venda")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{background:"#6366f1"}}>
            <Plus className="w-4 h-4"/> Venda Parcelada
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Categoria</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Pagamento</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">Valor</th>
              <th className="w-10"/>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">Nenhum faturamento encontrado</td></tr>
            ) : filtered.sort((a,b) => {
              const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
              const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
              return db - da;
            }).map(tx => (
              <tr key={tx.id} className="border-t border-gray-50 hover:bg-gray-50/60 group">
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(tx.dueDate || tx.paidAt)}</td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{tx.description}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{tx.client?.name || "—"}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tx.category}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{tx.paymentMethod || "—"}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={tx.status} type="receita" dueDate={tx.dueDate}
                    onClick={() => onToggle(tx.id, tx.status==="pago" ? "pendente" : "pago")}/>
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{color: tx.status==="pago" ? "#16a34a" : "#6b7280"}}>
                  {fmt(tx.amount)}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => onDelete(tx.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-green-50">
                <td colSpan={6} className="px-4 py-3 text-sm font-bold text-green-800 uppercase">Total</td>
                <td className="px-4 py-3 text-right text-base font-bold text-green-700">
                  {fmt(filtered.reduce((s,t) => s+t.amount, 0))}
                </td>
                <td/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showType === "receita" && (
        <NovaReceitaModal clients={clients} onClose={() => setShowType(null)}
          onSave={tx => { onAddTx(tx); setShowType(null); }}/>
      )}
      {showType === "venda" && (
        <NovaVendaModal clients={clients} onClose={() => setShowType(null)}
          onSave={sale => { onAddSale(sale); setShowType(null); }}/>
      )}
    </div>
  );
}

// ─── Tab: Parcelas a Receber ──────────────────────────────────────
function ParcelasReceber({ sales, clients, onToggleParcela, onAddSale }: {
  sales: Sale[];
  clients: Client[];
  onToggleParcela: (saleId: string, parcelaId: string, status: string) => void;
  onAddSale: (sale: Sale) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<"todas"|"pendente"|"pago">("todas");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  const allInstallments = sales.flatMap(s => s.installments);
  const totalAReceber = allInstallments.filter(i => i.status !== "pago").reduce((s,i) => s+i.amount, 0);
  const totalRecebido = allInstallments.filter(i => i.status === "pago").reduce((s,i) => s+i.amount, 0);
  const vencidas = allInstallments.filter(i => i.status !== "pago" && new Date(i.dueDate) < new Date());

  const filteredSales = filter === "todas" ? sales
    : filter === "pendente" ? sales.filter(s => s.installments.some(i => i.status !== "pago"))
    : sales.filter(s => s.installments.every(i => i.status === "pago"));

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500"/>
            <span className="text-xs text-gray-500">A Receber</span>
          </div>
          <p className="text-xl font-bold text-amber-600">{fmt(totalAReceber)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{allInstallments.filter(i=>i.status!=="pago").length} parcelas</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-500"/>
            <span className="text-xs text-gray-500">Vencidas</span>
          </div>
          <p className="text-xl font-bold text-red-600">{fmt(vencidas.reduce((s,i)=>s+i.amount,0))}</p>
          <p className="text-xs text-gray-400 mt-0.5">{vencidas.length} parcelas</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500"/>
            <span className="text-xs text-gray-500">Recebido</span>
          </div>
          <p className="text-xl font-bold text-green-600">{fmt(totalRecebido)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{allInstallments.filter(i=>i.status==="pago").length} parcelas</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["pendente","pago","todas"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter===f ? "text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
              style={filter===f ? {background:"#6366f1"} : {}}>
              {f==="pendente"?"Pendentes":f==="pago"?"Quitadas":"Todas"}
            </button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{background:"#6366f1"}}>
          <Plus className="w-4 h-4"/> Nova Venda Parcelada
        </button>
      </div>

      {/* Sales list */}
      <div className="space-y-3">
        {filteredSales.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400 text-sm">
            Nenhuma venda encontrada
          </div>
        ) : filteredSales.map(sale => {
          const paidCount = sale.installments.filter(i => i.status === "pago").length;
          const progress = sale.installmentsCount > 0 ? (paidCount / sale.installmentsCount) * 100 : 0;
          const isExpanded = expanded.has(sale.id);
          const paidAmount = sale.installments.filter(i=>i.status==="pago").reduce((s,i)=>s+i.amount,0);

          return (
            <div key={sale.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Sale header */}
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                onClick={() => toggleExpand(sale.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-gray-800 truncate">{sale.description}</p>
                    {sale.negotiationNotes && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full hidden sm:inline">nota</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="font-medium text-indigo-600">{sale.client.name}</span>
                    <span>·</span>
                    <span>{sale.installmentsCount}x {fmt(sale.totalAmount/sale.installmentsCount)}</span>
                    <span>·</span>
                    <span>{sale.paymentMethod || "—"}</span>
                    <span>·</span>
                    <span>{fmtDate(sale.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400 mb-1">{paidCount}/{sale.installmentsCount} pagas</p>
                  <div className="w-32 bg-gray-100 rounded-full h-1.5 mb-1">
                    <div className="h-1.5 rounded-full transition-all" style={{width:`${progress}%`, background:"#6366f1"}}/>
                  </div>
                  <p className="text-xs font-semibold text-green-600">{fmt(paidAmount)} <span className="text-gray-300">/ {fmt(sale.totalAmount)}</span></p>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}/>
              </div>

              {/* Installments grid */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4">
                  {sale.negotiationNotes && (
                    <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2 mb-4 italic">💬 {sale.negotiationNotes}</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {sale.installments.map(inst => {
                      const paid = inst.status === "pago";
                      const over = isOverdue(inst.status, inst.dueDate);
                      return (
                        <button key={inst.id}
                          onClick={() => onToggleParcela(sale.id, inst.id, paid ? "pendente" : "pago")}
                          className={`rounded-xl p-3 text-center border transition-all hover:scale-105 ${
                            paid ? "bg-green-50 border-green-200 hover:bg-green-100"
                            : over ? "bg-red-50 border-red-200 hover:bg-red-100"
                            : "bg-gray-50 border-gray-200 hover:bg-indigo-50 hover:border-indigo-200"
                          }`}>
                          <p className="text-[10px] font-bold text-gray-500 mb-1">Parcela {inst.number}</p>
                          <p className="text-sm font-bold" style={{color: paid?"#16a34a":over?"#dc2626":"#374151"}}>
                            {fmt(inst.amount)}
                          </p>
                          <p className="text-[10px] mt-1" style={{color: paid?"#16a34a":over?"#dc2626":"#9ca3af"}}>
                            {fmtShort(inst.dueDate)}
                          </p>
                          {paid && <Check className="w-3 h-3 text-green-500 mx-auto mt-1"/>}
                          {over && !paid && <AlertCircle className="w-3 h-3 text-red-500 mx-auto mt-1"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <NovaVendaModal clients={clients} onClose={() => setShowModal(false)}
          onSave={sale => { onAddSale(sale); setShowModal(false); }}/>
      )}
    </div>
  );
}

// ─── Tab: Fluxo de Caixa ──────────────────────────────────────────
// (inline add row for quick entry)
// ─── FluxoPanel (top-level, extracted from FluxoCaixa for Turbopack) ──
type NewRow = { description: string; amount: string; category: string; status: string; dueDate: string; paymentMethod: string; clientId: string };

function FluxoPanel({ type, rows, clients, onToggle, onDelete, onAdd }: {
  type: "receita" | "despesa";
  rows: Tx[];
  clients: Client[];
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAdd: (tx: Tx) => void;
}) {
  const isIncome = type === "receita";
  const categories = isIncome ? INCOME_CATS : EXPENSE_CATS;

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<NewRow>({ description:"", amount:"", category: isIncome?"Consultoria":"Outros", status:"pendente", dueDate:new Date().toISOString().slice(0,10), paymentMethod:"Pix", clientId:"" });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const grouped = categories.reduce<Record<string,Tx[]>>((a,c) => { a[c]=rows.filter(t=>t.category===c); return a; }, {});
  const other = rows.filter(t=>!categories.includes(t.category));
  if (other.length) grouped["Outros"]=[...(grouped["Outros"]||[]),...other];

  const total = rows.reduce((s,t)=>s+t.amount,0);
  const real  = rows.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);

  function startAdding() {
    setNewRow({ description:"", amount:"", category: isIncome?"Consultoria":"Outros", status:"pendente", dueDate:new Date().toISOString().slice(0,10), paymentMethod:"Pix", clientId:"" });
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function saveRow() {
    if (!newRow.description || !newRow.amount) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/lancamentos", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({...newRow, type, amount:parseFloat(newRow.amount.replace(",","."))}),
    });
    const data = await res.json();
    onAdd(data);
    setSaving(false);
    setAdding(false);
  }

  return (
    <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={{background:isIncome?"#f0fdf4":"#fff5f5"}}>
        <div className="flex items-center gap-2">
          {isIncome ? <TrendingUp className="w-4 h-4 text-green-600"/> : <TrendingDown className="w-4 h-4 text-red-500"/>}
          <span className="font-bold text-sm" style={{color:isIncome?"#166534":"#991b1b"}}>{isIncome?"RECEITAS":"DESPESAS"}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className="font-bold" style={{color:isIncome?"#16a34a":"#dc2626"}}>{fmt(real)}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-gray-500">{fmt(total)}</span>
          </div>
          <button onClick={startAdding}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white"
            style={{background:isIncome?"#16a34a":"#dc2626"}}>
            <Plus className="w-3 h-3"/> Adicionar
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/40">
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase w-14">Data</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Descrição</th>
              {isIncome && <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Cliente</th>}
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase hidden lg:table-cell">Categoria</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase hidden xl:table-cell">Pgto</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Status</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase">Valor</th>
              <th className="w-8"/>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => {
              const catRows = grouped[cat]||[];
              if (!catRows.length) return null;
              const catTotal = catRows.reduce((s,t)=>s+t.amount,0);
              const catReal  = catRows.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
              return (
                <Fragment key={cat}>
                  <tr style={{background:isIncome?"#f0fdf4":"#fef2f2"}}>
                    <td colSpan={isIncome?5:4} className="px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{color:isIncome?"#166534":"#991b1b"}}>{cat}</span>
                      <span className="text-gray-400 text-[10px] ml-1">({catRows.length})</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[10px]">
                      <span className="text-gray-400">{fmt(catReal)}</span><span className="text-gray-300 mx-1">/</span>
                      <span className="font-semibold" style={{color:isIncome?"#166534":"#991b1b"}}>{fmt(catTotal)}</span>
                    </td>
                    <td/>
                  </tr>
                  {catRows.map(tx => (
                    <tr key={tx.id} className="border-t border-gray-50 hover:bg-gray-50/80 group">
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{fmtShort(tx.dueDate||tx.paidAt)}</td>
                      <td className="px-3 py-1.5 text-gray-700 max-w-[140px] truncate" title={tx.description}>{tx.description}</td>
                      {isIncome && <td className="px-3 py-1.5 text-gray-500 max-w-[90px] truncate">{tx.client?.name||"—"}</td>}
                      <td className="px-3 py-1.5 text-gray-400 hidden lg:table-cell">{tx.category}</td>
                      <td className="px-3 py-1.5 text-gray-400 hidden xl:table-cell">{tx.paymentMethod||"—"}</td>
                      <td className="px-3 py-1.5">
                        <StatusBadge status={tx.status} type={type} dueDate={tx.dueDate}
                          onClick={() => onToggle(tx.id, tx.status==="pago"?"pendente":"pago")}/>
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-right whitespace-nowrap"
                        style={{color:tx.status==="pago"?(isIncome?"#16a34a":"#dc2626"):"#9ca3af"}}>{fmt(tx.amount)}</td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => onDelete(tx.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {adding && (
              <tr className="border-t border-indigo-100 bg-indigo-50/50">
                <td className="px-2 py-1.5">
                  <input type="date" value={newRow.dueDate} onChange={e=>setNewRow({...newRow,dueDate:e.target.value})}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white"/>
                </td>
                <td className="px-2 py-1.5">
                  <input ref={inputRef} value={newRow.description} onChange={e=>setNewRow({...newRow,description:e.target.value})}
                    onKeyDown={e=>{if(e.key==="Enter")saveRow();if(e.key==="Escape")setAdding(false);}}
                    placeholder="Descrição..." className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white"/>
                </td>
                {isIncome && (
                  <td className="px-2 py-1.5">
                    <select value={newRow.clientId} onChange={e=>setNewRow({...newRow,clientId:e.target.value})}
                      className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white">
                      <option value="">—</option>
                      {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                )}
                <td className="px-2 py-1.5 hidden lg:table-cell">
                  <select value={newRow.category} onChange={e=>setNewRow({...newRow,category:e.target.value})}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white">
                    {categories.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 hidden xl:table-cell">
                  <select value={newRow.paymentMethod} onChange={e=>setNewRow({...newRow,paymentMethod:e.target.value})}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white">
                    {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select value={newRow.status} onChange={e=>setNewRow({...newRow,status:e.target.value})}
                    className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white">
                    <option value="pendente">{isIncome?"A RECEBER":"A PAGAR"}</option>
                    <option value="pago">{isIncome?"RECEBIDO":"PAGO"}</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input value={newRow.amount} onChange={e=>setNewRow({...newRow,amount:e.target.value})}
                    placeholder="0,00" className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white text-right"/>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex gap-1">
                    <button onClick={saveRow} disabled={saving} className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"><Check className="w-3 h-3"/></button>
                    <button onClick={() => setAdding(false)} className="p-1 rounded bg-gray-200 text-gray-500 hover:bg-gray-300"><X className="w-3 h-3"/></button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200" style={{background:isIncome?"#f0fdf4":"#fef2f2"}}>
              <td colSpan={isIncome?4:3} className="px-3 py-2.5 text-xs font-bold uppercase" style={{color:isIncome?"#166534":"#991b1b"}}>Total</td>
              <td colSpan={3} className="px-3 py-2.5 text-right">
                <span className="text-xs text-gray-400">{fmt(real)}</span>
                <span className="text-gray-300 mx-1">/</span>
                <span className="text-base font-bold" style={{color:isIncome?"#16a34a":"#dc2626"}}>{fmt(total)}</span>
              </td>
              <td/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FluxoCaixa({ txs, monthDate, clients, onAdd, onToggle, onDelete }: {
  txs: Tx[]; monthDate: Date; clients: Client[];
  onAdd: (tx: Tx) => void; onToggle: (id: string, status: string) => void; onDelete: (id: string) => void;
}) {
  const monthTxs = txs.filter(t => inMonth(monthDate, t.dueDate) || inMonth(monthDate, t.paidAt));
  const receitas = monthTxs.filter(t => t.type === "receita");
  const despesas = monthTxs.filter(t => t.type === "despesa");

  return (
    <div className="flex gap-5 items-start">
      <FluxoPanel type="despesa" rows={despesas} clients={clients} onToggle={onToggle} onDelete={onDelete} onAdd={onAdd}/>
      <FluxoPanel type="receita" rows={receitas} clients={clients} onToggle={onToggle} onDelete={onDelete} onAdd={onAdd}/>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const today = new Date();
  const [tab, setTab]             = useState<TabKey>("fluxo");
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [txs, setTxs]             = useState<Tx[]>([]);
  const [sales, setSales]         = useState<Sale[]>([]);
  const [clients, setClients]     = useState<Client[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showExtrato, setShowExtrato] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState("");

  useEffect(() => {
    setLoading(true);
    async function safeJson(r: Response) {
      try { return await r.json(); } catch (_e) { return null; }
    }
    Promise.all([
      fetch("/api/financeiro/lancamentos").then(safeJson),
      fetch("/api/financeiro/vendas").then(safeJson),
      fetch("/api/alunos").then(safeJson),
    ]).then(([txData, salesData, clientData]) => {
      setTxs(Array.isArray(txData) ? txData : []);
      setSales(Array.isArray(salesData) ? salesData : []);
      setClients(Array.isArray(clientData) ? clientData.map((c: Client) => ({id:c.id,name:c.name})) : []);
      setLoading(false);
    });
  }, []);

  // ── Shared handlers ──
  function addTx(tx: Tx) { setTxs(prev => [...prev, tx]); }
  function addSale(sale: Sale) { setSales(prev => [sale, ...prev]); }

  async function toggleTx(id: string, status: string) {
    const res = await fetch(`/api/financeiro/lancamentos/${id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status}),
    });
    const updated = await res.json();
    setTxs(prev => prev.map(t => t.id===id ? {...t,...updated} : t));
  }

  async function deleteTx(id: string) {
    if (!confirm("Remover este lançamento?")) return;
    await fetch(`/api/financeiro/lancamentos/${id}`, {method:"DELETE"});
    setTxs(prev => prev.filter(t => t.id!==id));
  }

  async function toggleParcela(saleId: string, parcelaId: string, status: string) {
    const res = await fetch(`/api/financeiro/vendas/${saleId}/parcelas/${parcelaId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status}),
    });
    const updated = await res.json();
    setSales(prev => prev.map(s => s.id===saleId
      ? {...s, installments: s.installments.map(i => i.id===parcelaId ? {...i,...updated} : i)}
      : s));
  }

  // ── Summary numbers ──
  const monthTxs = txs.filter(t => inMonth(monthDate, t.dueDate) || inMonth(monthDate, t.paidAt));
  const realR = monthTxs.filter(t=>t.type==="receita"&&t.status==="pago").reduce((s,t)=>s+t.amount,0);
  const totalR= monthTxs.filter(t=>t.type==="receita").reduce((s,t)=>s+t.amount,0);
  const realD = monthTxs.filter(t=>t.type==="despesa"&&t.status==="pago").reduce((s,t)=>s+t.amount,0);
  const totalD= monthTxs.filter(t=>t.type==="despesa").reduce((s,t)=>s+t.amount,0);
  const saldo = parseFloat(saldoInicial.replace(",",".")) || 0;

  const TABS: {key:TabKey; label:string; icon:React.ReactNode}[] = [
    {key:"fluxo",      label:"Fluxo de Caixa",      icon:<LayoutGrid className="w-4 h-4"/>},
    {key:"pagar",      label:"Contas a Pagar",       icon:<CreditCard className="w-4 h-4"/>},
    {key:"faturamento",label:"Faturamento",           icon:<Receipt className="w-4 h-4"/>},
    {key:"parcelas",   label:"Parcelas a Receber",   icon:<ListChecks className="w-4 h-4"/>},
  ];

  const pendentesCount = txs.filter(t=>t.type==="despesa"&&t.status!=="pago").length;
  const overdueCount   = txs.filter(t=>t.type==="despesa"&&t.status!=="pago"&&t.dueDate&&new Date(t.dueDate)<new Date()).length;
  const parcelasOk     = sales.flatMap(s=>s.installments).filter(i=>i.status!=="pago").length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
            <p className="text-gray-400 text-sm mt-0.5">Controle financeiro completo</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Month nav (only for fluxo) */}
            {tab === "fluxo" && (
              <div className="flex items-center gap-1 bg-gray-50 rounded-xl px-2 py-1 border border-gray-200">
                <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400"><ChevronLeft className="w-4 h-4"/></button>
                <span className="text-sm font-bold text-gray-800 w-36 text-center">{MONTHS[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
                <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400"><ChevronRight className="w-4 h-4"/></button>
              </div>
            )}
            <button onClick={() => setShowExtrato(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
              style={{background:"#6366f1"}}>
              <Upload className="w-4 h-4"/> Importar Extrato IA
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
            <Wallet className="w-3.5 h-3.5 text-gray-400"/>
            <div>
              <p className="text-[9px] text-gray-400 uppercase font-bold">Saldo Inicial</p>
              <input value={saldoInicial} onChange={e=>setSaldoInicial(e.target.value)}
                placeholder="0,00" className="text-xs font-bold text-gray-800 bg-transparent w-20 focus:outline-none"/>
            </div>
          </div>
          <div className="bg-green-50 rounded-xl px-3 py-2 border border-green-100">
            <p className="text-[9px] text-green-500 uppercase font-bold">Receitas</p>
            <p className="text-xs font-bold text-green-700">{fmt(realR)} <span className="text-green-400 font-normal">/ {fmt(totalR)}</span></p>
          </div>
          <div className="bg-red-50 rounded-xl px-3 py-2 border border-red-100">
            <p className="text-[9px] text-red-400 uppercase font-bold">Despesas</p>
            <p className="text-xs font-bold text-red-600">{fmt(realD)} <span className="text-red-300 font-normal">/ {fmt(totalD)}</span></p>
          </div>
          <div className={`rounded-xl px-3 py-2 border ${(realR-realD)>=0?"bg-indigo-50 border-indigo-100":"bg-orange-50 border-orange-100"}`}>
            <p className={`text-[9px] uppercase font-bold ${(realR-realD)>=0?"text-indigo-400":"text-orange-400"}`}>Lucro</p>
            <p className={`text-xs font-bold ${(realR-realD)>=0?"text-indigo-700":"text-orange-600"}`}>{fmt(realR-realD)}</p>
          </div>
          <div className={`rounded-xl px-3 py-2 border ${(saldo+realR-realD)>=0?"bg-gray-50 border-gray-200":"bg-red-50 border-red-200"}`}>
            <p className="text-[9px] text-gray-400 uppercase font-bold flex items-center gap-1"><Target className="w-2.5 h-2.5"/>Saldo Final</p>
            <p className={`text-xs font-bold ${(saldo+realR-realD)>=0?"text-gray-800":"text-red-600"}`}>{fmt(saldo+realR-realD)}</p>
          </div>
          {overdueCount > 0 && (
            <div className="bg-red-50 rounded-xl px-3 py-2 border border-red-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500"/>
              <p className="text-xs font-bold text-red-600">{overdueCount} conta{overdueCount>1?"s":""} vencida{overdueCount>1?"s":""}</p>
            </div>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab===t.key ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {t.icon} {t.label}
              {t.key==="pagar" && pendentesCount>0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{background:overdueCount>0?"#ef4444":"#f59e0b"}}>
                  {pendentesCount}
                </span>
              )}
              {t.key==="parcelas" && parcelasOk>0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white bg-indigo-500">
                  {parcelasOk}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────── */}
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-gray-400 text-sm">Carregando...</div>
        ) : (
          <>
            {tab === "fluxo" && (
              <FluxoCaixa txs={txs} monthDate={monthDate} clients={clients}
                onAdd={addTx} onToggle={toggleTx} onDelete={deleteTx}/>
            )}
            {tab === "pagar" && (
              <ContasPagar txs={txs} onToggle={toggleTx} onDelete={deleteTx} onAdd={addTx}/>
            )}
            {tab === "faturamento" && (
              <Faturamento txs={txs} sales={sales} clients={clients} monthDate={monthDate}
                onToggle={toggleTx} onDelete={deleteTx} onAddTx={addTx} onAddSale={addSale}/>
            )}
            {tab === "parcelas" && (
              <ParcelasReceber sales={sales} clients={clients}
                onToggleParcela={toggleParcela} onAddSale={addSale}/>
            )}
          </>
        )}
      </div>

      {/* Extrato IA modal */}
      {showExtrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Importar Extrato com IA</h2>
                <p className="text-sm text-gray-400 mt-0.5">Upload do extrato bancário — a IA classifica automaticamente</p>
              </div>
              <button onClick={() => setShowExtrato(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <ExtratoContent onClose={() => setShowExtrato(false)} onImport={txList => setTxs(prev => [...prev, ...txList])}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Extrato content (separated to avoid hook rules issues) ──────
function ExtratoContent({ onClose, onImport }: { onClose: () => void; onImport: (txs: Tx[]) => void }) {
  const [file, setFile] = useState<File|null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<(Omit<Tx,"id">&{date?:string})[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/financeiro/extrato", {method:"POST",body:fd});
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Erro ${res.status}: ${errData.error || "resposta inválida do servidor"}`);
      }
      const data = await res.json();
      if (data.transactions) {
        setParsed(data.transactions);
        setSelected(new Set(data.transactions.map((_:unknown,i:number)=>i)));
      }
    } catch (err) {
      console.error("Erro ao analisar extrato:", err);
      alert(`Não foi possível analisar o extrato.\n\nDetalhes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    const toImport = parsed.filter((_,i) => selected.has(i));
    const results: Tx[] = [];
    for (const tx of toImport) {
      const res = await fetch("/api/financeiro/lancamentos", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({...tx, status:"pago", dueDate:tx.date}),
      });
      results.push(await res.json());
    }
    onImport(results); setImporting(false); onClose();
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      {parsed.length === 0 ? (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50">
            <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
            <p className="text-sm text-gray-500 mb-4">Selecione o arquivo do extrato bancário (.csv, .txt, .ofx)</p>
            <label className="cursor-pointer px-5 py-2 rounded-lg text-sm font-medium text-white" style={{background:"#6366f1"}}>
              Selecionar arquivo
              <input type="file" className="hidden" accept=".csv,.txt,.ofx" onChange={e => setFile(e.target.files?.[0]||null)}/>
            </label>
            {file && <p className="text-xs text-gray-400 mt-3">{file.name}</p>}
          </div>
          <button onClick={handleParse} disabled={!file||parsing}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{background:"#6366f1"}}>
            {parsing ? "Analisando com IA..." : "Analisar extrato"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">{parsed.length} transações encontradas</p>
            <button onClick={() => setSelected(selected.size===parsed.length ? new Set() : new Set(parsed.map((_,i)=>i)))}
              className="text-xs text-indigo-600 hover:underline">
              {selected.size===parsed.length?"Desmarcar todos":"Selecionar todos"}
            </button>
          </div>
          <div className="space-y-1.5 mb-4">
            {parsed.map((tx,i) => (
              <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected.has(i)?"border-indigo-200 bg-indigo-50":"border-gray-100 bg-gray-50"}`}>
                <input type="checkbox" checked={selected.has(i)}
                  onChange={() => setSelected(prev => { const s=new Set(prev); s.has(i)?s.delete(i):s.add(i); return s; })}/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                  <p className="text-xs text-gray-400">{tx.category} · {tx.date||""}</p>
                </div>
                <span className={`text-sm font-bold ${tx.type==="receita"?"text-green-600":"text-red-500"}`}>
                  {tx.type==="despesa"?"−":"+"}{fmt(tx.amount)}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-400">{selected.size} de {parsed.length} selecionados</p>
            <div className="flex gap-2">
              <button onClick={() => setParsed([])} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Voltar</button>
              <button onClick={handleImport} disabled={selected.size===0||importing}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{background:"#6366f1"}}>
                {importing ? "Importando..." : `Importar ${selected.size} lançamentos`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

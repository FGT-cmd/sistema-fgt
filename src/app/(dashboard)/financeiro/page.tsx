"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, Upload, RefreshCw,
  X, TrendingUp, TrendingDown, Loader2, ExternalLink, BarChart3,
  Settings, FileText, LayoutGrid, Calendar,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────
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
  _saleId?: string;
  _installmentId?: string;
};

type Installment = {
  id: string;
  number: number;
  amount: number;
  dueDate: string;
  paidAt?: string | null;
  status: string;
  notes?: string | null;
  label?: string | null;
  paymentMethod?: string | null;
};

type Sale = {
  id: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  negotiationNotes?: string | null;
  paymentMethod?: string | null;
  negotiationType?: string | null;
  grossValue?: number | null;
  netValue?: number | null;
  cashFlowDate?: string | null;
  status: string;
  clientId: string;
  createdAt: string;
  client: { id: string; name: string };
  installments: Installment[];
};

type Client = { id: string; name: string };

// ─── Constants ────────────────────────────────────────────────────
const EXPENSE_CATS = ["Custos fixos", "Custos variáveis", "Despesas", "Investimentos", "Pró-labore", "Reservas"];
const INCOME_CATS  = ["Consultoria anual", "Consultoria semestral", "Consultoria trimestral", "Aulas presenciais", "Caixa", "Faturamento", "Parcela", "Outros"];
const PAYMENT_METHODS_RECV = ["Pix", "Cartão", "InfinitePay", "Dinheiro", "Plataforma", "Outro"];
const PAYMENT_METHODS_PAY  = ["Pix PJ", "Cartão PJ", "Cartão PF", "Dinheiro", "Outro"];

const STATUSES_RECEITA = [
  { value: "pendente",  label: "A RECEBER" },
  { value: "pago",      label: "RECEBIDO" },
  { value: "atrasado",  label: "ATRASADO" },
  { value: "cancelado", label: "CANCELADO" },
];
const STATUSES_DESPESA = [
  { value: "pendente",  label: "A PAGAR" },
  { value: "pago",      label: "PAGO" },
  { value: "atrasado",  label: "ATRASADO" },
  { value: "cancelado", label: "CANCELADO" },
];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

type TabKey = "painel" | "mes" | "planejamento" | "config" | "lancamentos";

// ─── Helpers ──────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth()+1).padStart(2,"0")}/${dt.getUTCFullYear()}`;
}
function isOverdue(status: string, dueDate?: string | null) {
  if (status === "pago") return false;
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}
function inMonth(d: Date, dateStr?: string | null) {
  if (!dateStr) return false;
  const dt = new Date(dateStr);
  return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth();
}
function txDate(tx: Tx) {
  return tx.paidAt || tx.dueDate || null;
}

// ─── StatusBadge ──────────────────────────────────────────────────
function StatusBadge({ status, type, dueDate, onClick }: {
  status: string; type: "receita" | "despesa"; dueDate?: string | null; onClick?: () => void;
}) {
  const over = isOverdue(status, dueDate);
  const eff = (status === "pendente" && over) ? "atrasado" : status;
  const cfg: Record<string, { label: string; cls: string }> = {
    pendente:  { label: type === "receita" ? "A RECEBER" : "A PAGAR",  cls: "bg-amber-100 text-amber-700" },
    pago:      { label: type === "receita" ? "RECEBIDO"  : "PAGO",     cls: "bg-green-100 text-green-700" },
    atrasado:  { label: "ATRASADO",                                     cls: "bg-red-100 text-red-600" },
    cancelado: { label: "CANCELADO",                                    cls: "bg-gray-100 text-gray-400" },
  };
  const { label, cls } = cfg[eff] || cfg["pendente"];
  return (
    <button onClick={onClick}
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${cls} ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
      {label}
    </button>
  );
}

// ─── Modal base ───────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── NovaDespesaModal ─────────────────────────────────────────────
function NovaDespesaModal({ onClose, onSave }: { onClose: () => void; onSave: (tx: Tx) => void }) {
  const [form, setForm] = useState({
    description: "", amount: "", category: EXPENSE_CATS[0], paymentMethod: PAYMENT_METHODS_PAY[0],
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
            placeholder="Ex: Conta de internet..." autoFocus
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
              {PAYMENT_METHODS_PAY.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            {STATUSES_DESPESA.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── NovaReceitaModal ─────────────────────────────────────────────
function NovaReceitaModal({ clients, onClose, onSave }: {
  clients: Client[]; onClose: () => void; onSave: (tx: Tx) => void;
}) {
  const [form, setForm] = useState({
    description: "", amount: "", category: INCOME_CATS[0], paymentMethod: PAYMENT_METHODS_RECV[0],
    status: "pendente", dueDate: new Date().toISOString().slice(0,10), clientId: "",
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
    <Modal title="Novo Recebimento" subtitle="Receita avulsa sem parcelamento" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            placeholder="Ex: Consultoria, Sessão..." autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente</label>
          <select value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">— Sem cliente —</option>
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Forma</label>
            <select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {PAYMENT_METHODS_RECV.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            {STATUSES_RECEITA.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── NovaVendaModal ───────────────────────────────────────────────
function NovaVendaModal({ clients, onClose, onSave }: {
  clients: Client[]; onClose: () => void; onSave: (sale: Sale) => void;
}) {
  const [form, setForm] = useState({
    description: "", totalAmount: "", installmentsCount: "1", paymentMethod: "Pix",
    clientId: "", firstDueDate: new Date().toISOString().slice(0,10), negotiationNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const count = Math.max(1, parseInt(form.installmentsCount) || 1);
  const total = parseFloat(form.totalAmount.replace(",",".")) || 0;

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
            placeholder="Ex: Consultoria 3 meses..." autoFocus
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
        {total > 0 && (
          <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
            <p className="text-xs text-indigo-600 font-semibold">
              {count}x de {fmt(total / count)} · Total: {fmt(total)}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">1ª Parcela em</label>
            <input type="date" value={form.firstDueDate} onChange={e => setForm({...form, firstDueDate: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Forma</label>
            <select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod: e.target.value})}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {PAYMENT_METHODS_RECV.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notas de Negociação</label>
          <textarea rows={2} value={form.negotiationNotes} onChange={e => setForm({...form, negotiationNotes: e.target.value})}
            placeholder="Condições, descontos..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving || !form.clientId} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
            {saving ? "Criando..." : `Criar ${count} parcela${count > 1 ? "s" : ""}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── ExtratoContent ───────────────────────────────────────────────
function ExtratoContent({ onClose, onImport }: { onClose: () => void; onImport: (txs: Tx[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<(Omit<Tx,"id"> & { date?: string })[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/financeiro/extrato", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      if (data.transactions) {
        setParsed(data.transactions);
        setSelected(new Set(data.transactions.map((_: unknown, i: number) => i)));
      }
    } catch (err) {
      alert(`Não foi possível analisar o extrato.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    const toImport = parsed.filter((_, i) => selected.has(i));
    const results: Tx[] = [];
    for (const tx of toImport) {
      const res = await fetch("/api/financeiro/lancamentos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tx, dueDate: (tx as { date?: string }).date || null, status: tx.status || "pago" }),
      });
      if (res.ok) results.push(await res.json());
    }
    onImport(results);
    setImporting(false);
    onClose();
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {parsed.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Faça upload de um extrato bancário em formato CSV ou TXT. A IA vai classificar as transações automaticamente.</p>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
            <input type="file" accept=".csv,.txt,.ofx" onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" id="extrato-file"/>
            <label htmlFor="extrato-file" className="cursor-pointer">
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
              <p className="text-sm text-gray-400">{file ? file.name : "Clique para selecionar"}</p>
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleParse} disabled={!file || parsing}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
              {parsing ? "Analisando..." : "Analisar com IA"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">{parsed.length} transações encontradas</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {parsed.map((tx, i) => (
              <div key={i} onClick={() => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selected.has(i) ? "border-indigo-200 bg-indigo-50" : "border-gray-100 bg-white"}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.has(i) ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                  {selected.has(i) && <Check className="w-2.5 h-2.5 text-white"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{tx.description}</p>
                  <p className="text-[10px] text-gray-400">{tx.category} · {(tx as { date?: string }).date}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${tx.type === "receita" ? "text-green-600" : "text-red-600"}`}>
                  {tx.type === "despesa" ? "−" : "+"}{fmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setParsed([])} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Voltar</button>
            <button onClick={handleImport} disabled={selected.size === 0 || importing}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
              {importing ? "Importando..." : `Importar ${selected.size} lançamentos`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba 1: Painel ────────────────────────────────────────────────
function PainelTab({ allTxs }: { allTxs: Tx[] }) {
  const today = new Date();
  const year = today.getFullYear();

  const months = Array.from({ length: 12 }, (_, m) => {
    const md = new Date(year, m, 1);
    const recs = allTxs.filter(t => t.type === "receita" && (inMonth(md, t.dueDate) || inMonth(md, t.paidAt)));
    const desp = allTxs.filter(t => t.type === "despesa" && (inMonth(md, t.dueDate) || inMonth(md, t.paidAt)));
    const totalR = recs.reduce((s,t) => s+t.amount, 0);
    const realR  = recs.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0);
    const totalD = desp.reduce((s,t) => s+t.amount, 0);
    const realD  = desp.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0);
    const resultado = realR - realD;
    const margem = realR > 0 ? (resultado / realR) * 100 : null;
    return { m, totalR, realR, totalD, realD, resultado, margem };
  });

  const anoR = months.reduce((s, m) => s + m.realR, 0);
  const anoD = months.reduce((s, m) => s + m.realD, 0);
  const anoResult = anoR - anoD;
  const anoMargem = anoR > 0 ? (anoResult / anoR) * 100 : null;

  const hasSomeData = months.some(m => m.totalR > 0 || m.totalD > 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Receitas {year}</p>
          <p className="text-xl font-bold text-green-600">{fmt(anoR)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">realizadas no ano</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Despesas {year}</p>
          <p className="text-xl font-bold text-red-500">{fmt(anoD)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">pagas no ano</p>
        </div>
        <div className={`bg-white rounded-xl border shadow-sm p-4 ${anoResult >= 0 ? "border-green-100" : "border-red-100"}`}>
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Resultado {year}</p>
          <p className={`text-xl font-bold ${anoResult >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(anoResult)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">receitas − despesas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Margem {year}</p>
          <p className={`text-xl font-bold ${anoMargem !== null && anoMargem >= 0 ? "text-indigo-600" : "text-red-600"}`}>
            {anoMargem !== null ? `${anoMargem.toFixed(1)}%` : "—"}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">resultado / receitas</p>
        </div>
      </div>

      {/* Monthly table */}
      {hasSomeData ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-700">Receitas por mês — {year}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Mês</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Receitas</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Previsto</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Despesas</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Resultado</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Margem</th>
                </tr>
              </thead>
              <tbody>
                {months.map(({ m, totalR, realR, totalD, realD, resultado, margem }) => {
                  const isCurrent = m === today.getMonth() && year === today.getFullYear();
                  const noData = totalR === 0 && totalD === 0;
                  return (
                    <tr key={m} className={`border-t border-gray-50 ${isCurrent ? "bg-indigo-50/40" : "hover:bg-gray-50/50"} ${noData ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-700">
                        {MONTHS[m]}
                        {isCurrent && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">atual</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm font-semibold text-green-600">{fmt(realR)}</span>
                        {totalR > realR && <span className="text-[10px] text-gray-400 ml-1">/ {fmt(totalR)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-300">—</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm text-red-500">{realD > 0 ? fmt(realD) : "—"}</span>
                        {totalD > realD && <span className="text-[10px] text-gray-400 ml-1">/ {fmt(totalD)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {(realR > 0 || realD > 0) ? (
                          <span className={`text-sm font-semibold ${resultado >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(resultado)}</span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {margem !== null ? (
                          <span className={`text-sm ${margem >= 0 ? "text-indigo-600" : "text-red-500"}`}>{margem.toFixed(1)}%</span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-green-600">{fmt(anoR)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-300">—</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-500">{fmt(anoD)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{color: anoResult >= 0 ? "#16a34a" : "#dc2626"}}>{fmt(anoResult)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-600">
                    {anoMargem !== null ? `${anoMargem.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center text-gray-400 text-sm">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-200"/>
          Nenhum lançamento registrado em {year}
        </div>
      )}
    </div>
  );
}

// ─── Aba 2: Mês Atual ─────────────────────────────────────────────
function MesAtualTab({ allTxs, txs, monthDate, clients, onToggle, onDelete, onAdd, onAddSale }: {
  allTxs: Tx[]; txs: Tx[]; monthDate: Date;
  clients: Client[];
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAdd: (tx: Tx) => void;
  onAddSale: (sale: Sale) => void;
}) {
  const [saldoInicial, setSaldoInicial] = useState("");
  const [saldoBanco, setSaldoBanco] = useState("");
  const [modal, setModal] = useState<null | "receita" | "despesa" | "venda">(null);

  const monthReceitas = allTxs
    .filter(t => t.type === "receita" && (inMonth(monthDate, t.dueDate) || inMonth(monthDate, t.paidAt)))
    .sort((a,b) => new Date(txDate(a)||"").getTime() - new Date(txDate(b)||"").getTime());

  const monthDespesas = txs
    .filter(t => t.type === "despesa" && (inMonth(monthDate, t.dueDate) || inMonth(monthDate, t.paidAt)))
    .sort((a,b) => new Date(txDate(a)||"").getTime() - new Date(txDate(b)||"").getTime());

  const entradas   = monthReceitas.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0);
  const saidas     = monthDespesas.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0);
  const saldoI     = parseFloat(saldoInicial.replace(",",".")) || 0;
  const saldoCalc  = saldoI + entradas - saidas;
  const saldoB     = parseFloat(saldoBanco.replace(",",".")) || 0;
  const diferenca  = saldoBanco !== "" ? saldoCalc - saldoB : null;

  const aPagar    = monthDespesas.filter(t => t.status !== "pago" && t.status !== "cancelado");
  const aReceber  = monthReceitas.filter(t => t.status !== "pago" && t.status !== "cancelado");
  const vencidas  = aReceber.filter(t => isOverdue(t.status, t.dueDate));

  const totalReceitas = monthReceitas.reduce((s,t) => s+t.amount, 0);
  const totalDespesas = monthDespesas.reduce((s,t) => s+t.amount, 0);
  const resultado = entradas - saidas;
  const margem = entradas > 0 ? (resultado / entradas) * 100 : null;

  const despesasByCat = EXPENSE_CATS.map(cat => {
    const rows = monthDespesas.filter(t => t.category === cat);
    return { cat, total: rows.reduce((s,t) => s+t.amount, 0), pago: rows.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0) };
  }).filter(c => c.total > 0);

  const outrosCats = monthDespesas.filter(t => !EXPENSE_CATS.includes(t.category));
  if (outrosCats.length > 0) {
    despesasByCat.push({ cat: "Outros", total: outrosCats.reduce((s,t) => s+t.amount, 0), pago: outrosCats.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0) });
  }

  const inputCls = "border border-gray-200 rounded px-2 py-1 text-sm w-36 focus:outline-none focus:border-indigo-400 text-right";

  return (
    <div className="space-y-8">
      {/* Balanço Geral */}
      <section>
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Balanço Geral</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: "Saldo inicial", value: null, input: true, state: saldoInicial, setState: setSaldoInicial, note: "informe manualmente" },
                { label: "Entradas do mês", value: entradas, color: "text-green-600" },
                { label: "Saídas do mês",   value: saidas,   color: "text-red-500" },
                { label: "Saldo calculado", value: saldoCalc, bold: true, color: saldoCalc >= 0 ? "text-gray-800" : "text-red-600" },
                { label: "Saldo banco",     value: null, input: true, state: saldoBanco, setState: setSaldoBanco, note: "opcional" },
                ...(diferenca !== null ? [{ label: "Diferença", value: diferenca, color: Math.abs(diferenca) < 0.01 ? "text-green-600" : "text-amber-600", bold: true }] : []),
              ].map((row, i) => (
                <tr key={i} className={`border-b border-gray-50 last:border-0 ${row.bold ? "bg-gray-50" : ""}`}>
                  <td className="px-5 py-3 text-gray-500">{row.label}
                    {row.note && <span className="ml-1.5 text-[10px] text-gray-300">{row.note}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.input ? (
                      <input value={row.state as string} onChange={e => (row.setState as (v: string) => void)(e.target.value)}
                        placeholder="0,00" type="number" step="0.01" className={inputCls}/>
                    ) : (
                      <span className={`font-semibold ${row.color || "text-gray-700"} ${row.bold ? "text-base" : ""}`}>
                        {fmt(row.value as number)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pendências */}
      <section>
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Pendências</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
            <p className="text-[10px] text-amber-500 uppercase font-bold mb-1">A Pagar</p>
            <p className="text-xl font-bold text-amber-600">{fmt(aPagar.reduce((s,t) => s+t.amount, 0))}</p>
            <p className="text-xs text-gray-400 mt-0.5">{aPagar.length} lançamento{aPagar.length !== 1 ? "s" : ""}</p>
          </div>
          <div className={`bg-white rounded-xl border shadow-sm p-4 ${vencidas.length > 0 ? "border-red-100" : "border-amber-100"}`}>
            <p className={`text-[10px] uppercase font-bold mb-1 ${vencidas.length > 0 ? "text-red-500" : "text-amber-500"}`}>A Receber</p>
            <p className={`text-xl font-bold ${vencidas.length > 0 ? "text-red-600" : "text-amber-600"}`}>
              {fmt(aReceber.reduce((s,t) => s+t.amount, 0))}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {aReceber.length} pendente{aReceber.length !== 1 ? "s" : ""}
              {vencidas.length > 0 && <span className="ml-1.5 text-red-400 font-semibold">· {vencidas.length} vencida{vencidas.length !== 1 ? "s" : ""}</span>}
            </p>
          </div>
        </div>
      </section>

      {/* Resumo do mês */}
      <section>
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Resumo do Mês</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Categoria</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Previsto</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Realizado</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 bg-green-50/30">
                <td className="px-5 py-2.5 font-semibold text-green-700">Receitas</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-300">{fmt(totalReceitas)}</td>
                <td className="px-5 py-2.5 text-right font-semibold text-green-600">{fmt(entradas)}</td>
              </tr>
              {despesasByCat.map(c => (
                <tr key={c.cat} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 text-gray-600">{c.cat}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-gray-400">{fmt(c.total)}</td>
                  <td className="px-5 py-2.5 text-right text-red-500">{c.pago > 0 ? fmt(c.pago) : "—"}</td>
                </tr>
              ))}
              {despesasByCat.length === 0 && (
                <tr className="border-b border-gray-50">
                  <td className="px-5 py-2.5 text-gray-400 italic" colSpan={3}>Nenhuma despesa lançada</td>
                </tr>
              )}
              <tr className="border-b border-gray-100 bg-gray-50">
                <td className="px-5 py-2.5 font-semibold text-gray-700">Total despesas</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-400">{fmt(totalDespesas)}</td>
                <td className="px-5 py-2.5 text-right font-semibold text-red-500">{fmt(saidas)}</td>
              </tr>
              <tr className={`border-b border-gray-100 ${resultado >= 0 ? "bg-green-50/40" : "bg-red-50/40"}`}>
                <td className="px-5 py-2.5 font-bold text-gray-800">Resultado</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-400">{fmt(totalReceitas - totalDespesas)}</td>
                <td className={`px-5 py-2.5 text-right font-bold text-base ${resultado >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(resultado)}</td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-semibold text-gray-600">Margem de lucro</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-300">—</td>
                <td className="px-5 py-2.5 text-right font-semibold text-indigo-600">
                  {margem !== null ? `${margem.toFixed(1)}%` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Recebimentos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Recebimentos</h2>
          <div className="flex gap-2">
            <button onClick={() => setModal("receita")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700">
              <Plus className="w-3 h-3"/> Receita
            </button>
            <button onClick={() => setModal("venda")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-3 h-3"/> Nova Venda
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {monthReceitas.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">Nenhum recebimento neste mês</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Data</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Valor</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden md:table-cell">Cliente</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden lg:table-cell">Categoria</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden xl:table-cell">Forma</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase">Status</th>
                  <th className="w-8"/>
                </tr>
              </thead>
              <tbody>
                {monthReceitas.map(tx => {
                  const isVirtual = tx.id.startsWith("inst_") || tx.id.startsWith("rev_");
                  const over = isOverdue(tx.status, tx.dueDate);
                  return (
                    <tr key={tx.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${over && tx.status !== "pago" ? "bg-red-50/20" : ""}`}>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(txDate(tx))}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-sm" style={{color: tx.status === "pago" ? "#16a34a" : "#374151"}}>
                        {fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 hidden md:table-cell">
                        {tx.client ? (
                          <Link href={`/alunos?open=${tx.client.id}`} className="hover:text-indigo-600 flex items-center gap-1 group">
                            {tx.client.name}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-300"/>
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell truncate max-w-[120px]">
                        {tx.category}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden xl:table-cell">{tx.paymentMethod || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={tx.status} type="receita" dueDate={tx.dueDate}
                          onClick={() => onToggle(tx.id, tx.status === "pago" ? "pendente" : "pago")}/>
                      </td>
                      <td className="px-2 py-2.5">
                        {!isVirtual && (
                          <button onClick={() => onDelete(tx.id)}
                            className="opacity-0 hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-100 bg-gray-50">
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-green-600" colSpan={5}>
                    {fmt(monthReceitas.reduce((s,t) => s+t.amount, 0))}
                    <span className="ml-2 text-xs font-normal text-gray-400">· recebido: {fmt(entradas)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {/* Pagamentos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Pagamentos</h2>
          <button onClick={() => setModal("despesa")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600">
            <Plus className="w-3 h-3"/> Nova Despesa
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {monthDespesas.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">Nenhum pagamento neste mês</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Data</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Valor</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden lg:table-cell">Categoria</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden md:table-cell">Descrição</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden xl:table-cell">Forma</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase">Status</th>
                  <th className="w-8"/>
                </tr>
              </thead>
              <tbody>
                {monthDespesas.map(tx => {
                  const over = isOverdue(tx.status, tx.dueDate);
                  return (
                    <tr key={tx.id} className={`border-t border-gray-50 hover:bg-gray-50/50 group ${over && tx.status !== "pago" ? "bg-red-50/20" : ""}`}>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(txDate(tx))}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-sm" style={{color: tx.status === "pago" ? "#dc2626" : "#374151"}}>
                        {fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell">{tx.category}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 hidden md:table-cell truncate max-w-[180px]">{tx.description}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden xl:table-cell">{tx.paymentMethod || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={tx.status} type="despesa" dueDate={tx.dueDate}
                          onClick={() => onToggle(tx.id, tx.status === "pago" ? "pendente" : "pago")}/>
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => onDelete(tx.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-100 bg-gray-50">
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-500" colSpan={5}>
                    {fmt(monthDespesas.reduce((s,t) => s+t.amount, 0))}
                    <span className="ml-2 text-xs font-normal text-gray-400">· pago: {fmt(saidas)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {modal === "receita" && <NovaReceitaModal clients={clients} onClose={() => setModal(null)} onSave={tx => { onAdd(tx); setModal(null); }}/>}
      {modal === "despesa" && <NovaDespesaModal onClose={() => setModal(null)} onSave={tx => { onAdd(tx); setModal(null); }}/>}
      {modal === "venda"   && <NovaVendaModal clients={clients} onClose={() => setModal(null)} onSave={sale => { onAddSale(sale); setModal(null); }}/>}
    </div>
  );
}

// ─── Aba 3: Planejamento Anual ────────────────────────────────────
function PlanejamentoTab({ allTxs, txs }: { allTxs: Tx[]; txs: Tx[] }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const months = Array.from({ length: 12 }, (_, m) => {
    const md = new Date(year, m, 1);
    const recs = allTxs.filter(t => t.type === "receita" && (inMonth(md, t.dueDate) || inMonth(md, t.paidAt)));
    const desp = txs.filter(t => t.type === "despesa" && (inMonth(md, t.dueDate) || inMonth(md, t.paidAt)));

    const realR  = recs.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0);
    const prevR  = recs.reduce((s,t) => s+t.amount, 0);
    const realD  = desp.filter(t => t.status === "pago").reduce((s,t) => s+t.amount, 0);
    const prevD  = desp.reduce((s,t) => s+t.amount, 0);

    const getcat = (cat: string) => ({
      real: desp.filter(t => t.category === cat && t.status === "pago").reduce((s,t) => s+t.amount, 0),
      prev: desp.filter(t => t.category === cat).reduce((s,t) => s+t.amount, 0),
    });

    const resultado = realR - realD;
    const margem = realR > 0 ? (resultado / realR) * 100 : null;

    return { m, realR, prevR, realD, prevD, resultado, margem,
      fixos: getcat("Custos fixos"),
      variaveis: getcat("Custos variáveis"),
      despesas: getcat("Despesas"),
      invest: getcat("Investimentos"),
    };
  });

  const tot = (fn: (m: typeof months[0]) => number) => months.reduce((s,m) => s+fn(m), 0);
  const totalR = tot(m => m.realR);
  const totalD = tot(m => m.realD);
  const totalResult = totalR - totalD;
  const totalMargem = totalR > 0 ? (totalResult / totalR) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Planejamento Anual</h2>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4 text-gray-500"/>
          </button>
          <span className="px-3 py-1 text-sm font-semibold text-gray-700 min-w-[60px] text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight className="w-4 h-4 text-gray-500"/>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase sticky left-0 bg-gray-50">Mês</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-green-500 uppercase">Rec. Proj.</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-green-600 uppercase">Rec. Real.</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase">Custos Fixos</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase">Custos Var.</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase">Despesas</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase">Invest.</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-500 uppercase">Resultado</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase">Margem</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({ m, realR, prevR, realD, resultado, margem, fixos, variaveis, despesas, invest }) => {
                const isCurrent = m === new Date().getMonth() && year === currentYear;
                const noData = realR === 0 && realD === 0 && prevR === 0;
                return (
                  <tr key={m} className={`border-t border-gray-50 ${isCurrent ? "bg-indigo-50/40" : "hover:bg-gray-50/50"} ${noData ? "opacity-40" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-inherit">
                      {MONTHS[m].slice(0,3)}
                      {isCurrent && <span className="ml-1 text-[9px] text-indigo-500 font-bold">▸</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-300">—</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600">{realR > 0 ? fmt(realR) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{fixos.real > 0 ? fmt(fixos.real) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{variaveis.real > 0 ? fmt(variaveis.real) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{despesas.real > 0 ? fmt(despesas.real) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{invest.real > 0 ? fmt(invest.real) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold" style={{color: resultado >= 0 ? "#16a34a" : "#dc2626"}}>
                      {(realR > 0 || realD > 0) ? fmt(resultado) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-indigo-600">
                      {margem !== null ? `${margem.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase sticky left-0 bg-gray-50">Total</td>
                <td className="px-4 py-3 text-right text-xs text-gray-300">—</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-green-600">{fmt(totalR)}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{fmt(tot(m => m.fixos.real))}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{fmt(tot(m => m.variaveis.real))}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{fmt(tot(m => m.despesas.real))}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-500">{fmt(tot(m => m.invest.real))}</td>
                <td className="px-4 py-3 text-right text-xs font-bold" style={{color: totalResult >= 0 ? "#16a34a" : "#dc2626"}}>{fmt(totalResult)}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-indigo-600">
                  {totalMargem !== null ? `${totalMargem.toFixed(1)}%` : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">* Rec. Proj. = receitas projetadas (configurável em breve). Valores realizados = apenas lançamentos com status PAGO.</p>
    </div>
  );
}

// ─── Aba 4: Configurações ─────────────────────────────────────────
function ConfiguracoesTab() {
  const sections = [
    {
      title: "Categorias de Receita",
      color: "green",
      items: ["Consultoria anual", "Consultoria semestral", "Consultoria trimestral", "Aulas presenciais", "Caixa", "Faturamento", "Parcela", "Outros"],
    },
    {
      title: "Categorias de Saída",
      color: "red",
      items: ["Custos fixos", "Custos variáveis", "Despesas", "Investimentos", "Pró-labore", "Reservas"],
    },
    {
      title: "Formas de Recebimento",
      color: "blue",
      items: ["Pix", "Cartão", "InfinitePay", "Dinheiro", "Plataforma", "Outro"],
    },
    {
      title: "Formas de Pagamento",
      color: "purple",
      items: ["Pix PJ", "Cartão PJ", "Cartão PF", "Dinheiro", "Outro"],
    },
  ];

  const colorMap: Record<string, { bg: string; text: string; badge: string }> = {
    green:  { bg: "bg-green-50",  text: "text-green-700",  badge: "bg-green-100 text-green-700" },
    red:    { bg: "bg-red-50",    text: "text-red-700",    badge: "bg-red-100 text-red-700" },
    blue:   { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Categorias e formas que organizam o financeiro. Edição via CRUD disponível em versão futura.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(sec => {
          const c = colorMap[sec.color];
          return (
            <div key={sec.title} className={`rounded-xl border ${c.bg} border-opacity-50 overflow-hidden`} style={{borderColor: "rgba(0,0,0,0.06)"}}>
              <div className={`px-4 py-3 border-b border-opacity-10 ${c.bg}`}>
                <h3 className={`text-sm font-bold ${c.text}`}>{sec.title}</h3>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-2 bg-white">
                {sec.items.map(item => (
                  <span key={item} className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.badge}`}>{item}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Aba 5: Lançamentos ───────────────────────────────────────────
function LancamentosTab({ allTxs, txs, clients, onToggle, onDelete, onAdd, onAddSale }: {
  allTxs: Tx[]; txs: Tx[]; clients: Client[];
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAdd: (tx: Tx) => void;
  onAddSale: (sale: Sale) => void;
}) {
  const today = new Date();
  const [tipo, setTipo] = useState<"todos" | "receita" | "despesa">("todos");
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`);
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [modal, setModal] = useState<null | "receita" | "despesa" | "venda">(null);

  const allCombined = tipo === "despesa" ? txs.filter(t => t.type === "despesa") : allTxs;

  const filtered = allCombined.filter(t => {
    if (tipo !== "todos" && t.type !== tipo) return false;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const md = new Date(y, m-1, 1);
      if (!inMonth(md, t.dueDate) && !inMonth(md, t.paidAt)) return false;
    }
    if (catFilter && t.category !== catFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (clientFilter && t.client?.id !== clientFilter) return false;
    if (methodFilter && t.paymentMethod !== methodFilter) return false;
    return true;
  }).sort((a,b) => new Date(txDate(b)||"").getTime() - new Date(txDate(a)||"").getTime());

  const allCats = [...new Set(allTxs.map(t => t.category))].sort();
  const allMethods = [...new Set(allTxs.map(t => t.paymentMethod).filter(Boolean))].sort() as string[];

  const totalEntradas = filtered.filter(t => t.type === "receita").reduce((s,t) => s+t.amount, 0);
  const totalSaidas   = filtered.filter(t => t.type === "despesa").reduce((s,t) => s+t.amount, 0);

  const selectCls = "border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400 bg-white";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {(["todos","receita","despesa"] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-3 py-1.5 transition-colors ${tipo === t ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              {t === "todos" ? "Todos" : t === "receita" ? "Entradas" : "Saídas"}
            </button>
          ))}
        </div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={selectCls}/>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={selectCls}>
          <option value="">Categoria</option>
          {allCats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">Status</option>
          <option value="pago">Pago / Recebido</option>
          <option value="pendente">A Pagar / A Receber</option>
          <option value="atrasado">Atrasado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={selectCls}>
          <option value="">Cliente</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className={selectCls}>
          <option value="">Forma</option>
          {allMethods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {(catFilter || statusFilter || clientFilter || methodFilter) && (
          <button onClick={() => { setCatFilter(""); setStatusFilter(""); setClientFilter(""); setMethodFilter(""); }}
            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
            <X className="w-3 h-3"/> Limpar
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setModal("receita")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700">
            <Plus className="w-3 h-3"/> Receita
          </button>
          <button onClick={() => setModal("despesa")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600">
            <Plus className="w-3 h-3"/> Despesa
          </button>
          <button onClick={() => setModal("venda")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-3 h-3"/> Venda
          </button>
        </div>
      </div>

      {/* Summary line */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>{filtered.length} lançamento{filtered.length !== 1 ? "s" : ""}</span>
        {totalEntradas > 0 && <span className="text-green-600 font-semibold">Entradas: {fmt(totalEntradas)}</span>}
        {totalSaidas > 0 && <span className="text-red-500 font-semibold">Saídas: {fmt(totalSaidas)}</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-gray-400">Nenhum lançamento com esses filtros</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Data</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Descrição</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden md:table-cell">Cliente</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden lg:table-cell">Categoria</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden xl:table-cell">Forma</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Valor</th>
                  <th className="w-8"/>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const isVirtual = tx.id.startsWith("inst_") || tx.id.startsWith("rev_");
                  return (
                    <tr key={tx.id} className="border-t border-gray-50 hover:bg-gray-50/50 group">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(txDate(tx))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tx.type === "receita" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {tx.type === "receita" ? "entrada" : "saída"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 truncate max-w-[160px]">{tx.description}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell">
                        {tx.client ? (
                          <Link href={`/alunos?open=${tx.client.id}`} className="hover:text-indigo-600 flex items-center gap-1 group/l">
                            {tx.client.name}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover/l:opacity-100"/>
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell">{tx.category}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden xl:table-cell">{tx.paymentMethod || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={tx.status} type={tx.type} dueDate={tx.dueDate}
                          onClick={() => onToggle(tx.id, tx.status === "pago" ? "pendente" : "pago")}/>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-sm">
                        <span style={{color: tx.type === "receita" ? (tx.status === "pago" ? "#16a34a" : "#374151") : (tx.status === "pago" ? "#dc2626" : "#374151")}}>
                          {tx.type === "despesa" ? "−" : "+"}{fmt(tx.amount)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {!isVirtual && (
                          <button onClick={() => onDelete(tx.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === "receita" && <NovaReceitaModal clients={clients} onClose={() => setModal(null)} onSave={tx => { onAdd(tx); setModal(null); }}/>}
      {modal === "despesa" && <NovaDespesaModal onClose={() => setModal(null)} onSave={tx => { onAdd(tx); setModal(null); }}/>}
      {modal === "venda"   && <NovaVendaModal clients={clients} onClose={() => setModal(null)} onSave={sale => { onAddSale(sale); setModal(null); }}/>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const today = new Date();
  const [tab, setTab]             = useState<TabKey>("mes");
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [txs, setTxs]             = useState<Tx[]>([]);
  const [sales, setSales]         = useState<Sale[]>([]);
  const [clients, setClients]     = useState<Client[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showExtrato, setShowExtrato] = useState(false);

  async function loadData() {
    setLoading(true);
    async function safeJson(r: Response) { try { return await r.json(); } catch { return null; } }
    const [txData, salesData, clientData] = await Promise.all([
      fetch("/api/financeiro/lancamentos").then(safeJson),
      fetch("/api/financeiro/vendas").then(safeJson),
      fetch("/api/alunos").then(safeJson),
    ]);
    setTxs(Array.isArray(txData) ? txData : []);
    setSales(Array.isArray(salesData) ? salesData : []);
    setClients(Array.isArray(clientData) ? clientData.map((c: Client) => ({ id: c.id, name: c.name })) : []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // Virtual txs from installments (receita only)
  const installmentIds = new Set(
    txs.filter(t => (t as Tx & { installmentId?: string }).installmentId)
       .map(t => (t as Tx & { installmentId?: string }).installmentId as string)
  );

  const installmentTxs: Tx[] = sales.flatMap(sale => {
    const isCard = sale.negotiationType === "card";
    const txList: Tx[] = [];

    if (isCard && sale.grossValue && !installmentIds.has(`rev_${sale.id}`)) {
      txList.push({
        id: `rev_${sale.id}`, type: "receita",
        description: `${sale.description} (faturamento)`,
        amount: sale.grossValue, category: "Faturamento",
        status: "pago", dueDate: sale.createdAt ?? null, paidAt: sale.createdAt ?? null,
        paymentMethod: sale.paymentMethod ?? null, notes: null, client: sale.client, _saleId: sale.id,
      });
    }

    const instTxs: Tx[] = sale.installments
      .filter(inst => !installmentIds.has(inst.id))
      .map(inst => {
        const cashAmount = (isCard && (inst as Installment & { netValue?: number | null }).netValue)
          ? (inst as Installment & { netValue?: number | null }).netValue as number
          : inst.amount;
        const label = (inst as Installment & { label?: string | null }).label;
        const suffix = label ? ` — ${label}` : sale.installmentsCount > 1 ? ` (${inst.number}/${sale.installmentsCount})` : "";
        return {
          id: `inst_${inst.id}`, type: "receita" as const,
          description: isCard ? `${sale.description}${suffix} (caixa)` : `${sale.description}${suffix}`,
          amount: cashAmount,
          category: isCard ? "Caixa" : sale.installmentsCount === 1 ? "Consultoria anual" : "Parcela",
          status: inst.status, dueDate: inst.dueDate ?? null, paidAt: inst.paidAt ?? null,
          paymentMethod: sale.paymentMethod ?? null, notes: null, client: sale.client,
          _saleId: sale.id, _installmentId: inst.id,
        };
      });

    return [...txList, ...instTxs];
  });

  const allTxs: Tx[] = [...txs, ...installmentTxs];

  function addTx(tx: Tx) { setTxs(prev => [...prev, tx]); }
  function addSale(sale: Sale) { setSales(prev => [sale, ...prev]); }

  async function toggleTx(id: string, status: string) {
    if (id.startsWith("inst_")) {
      const instId = id.replace("inst_", "");
      const sale = sales.find(s => s.installments.some(i => i.id === instId));
      if (!sale) return;
      const paidAt = status === "pago" ? new Date().toISOString() : null;
      await fetch(`/api/financeiro/vendas/${sale.id}/parcelas/${instId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSales(prev => prev.map(s => s.id === sale.id
        ? { ...s, installments: s.installments.map(i => i.id === instId ? { ...i, status, paidAt } : i) }
        : s));
      return;
    }
    const res = await fetch(`/api/financeiro/lancamentos/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    const updated = await res.json();
    setTxs(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
  }

  async function deleteTx(id: string) {
    if (id.startsWith("inst_")) {
      alert("Para remover parcelas de aluno, exclua a venda na ficha do aluno.");
      return;
    }
    if (!confirm("Remover este lançamento?")) return;
    const res = await fetch(`/api/financeiro/lancamentos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Não foi possível remover.");
      return;
    }
    setTxs(prev => prev.filter(t => t.id !== id));
  }

  async function toggleParcela(saleId: string, parcelaId: string, status: string) {
    const paidAt = status === "pago" ? new Date().toISOString() : null;
    await fetch(`/api/financeiro/vendas/${saleId}/parcelas/${parcelaId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    setSales(prev => prev.map(s => s.id === saleId
      ? { ...s, installments: s.installments.map(i => i.id === parcelaId ? { ...i, status, paidAt } : i) }
      : s));
  }

  void toggleParcela; // preserved for future use in expanded views

  const monthLabel = `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "painel",       label: "Painel",            icon: <LayoutGrid className="w-4 h-4"/> },
    { key: "mes",          label: "Mês Atual",         icon: <Calendar className="w-4 h-4"/> },
    { key: "planejamento", label: "Planejamento Anual", icon: <BarChart3 className="w-4 h-4"/> },
    { key: "config",       label: "Configurações",     icon: <Settings className="w-4 h-4"/> },
    { key: "lancamentos",  label: "Lançamentos",       icon: <FileText className="w-4 h-4"/> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
            <p className="text-gray-400 text-sm mt-0.5">Gestão de caixa, recebimentos e pagamentos</p>
          </div>
          <div className="flex items-center gap-2">
            {tab === "mes" && (
              <div className="flex items-center gap-1 border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="p-2 hover:bg-gray-50 text-gray-500">
                  <ChevronLeft className="w-4 h-4"/>
                </button>
                <span className="px-3 text-sm font-semibold text-gray-700 min-w-[140px] text-center">{monthLabel}</span>
                <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="p-2 hover:bg-gray-50 text-gray-500">
                  <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            )}
            <button onClick={() => loadData()} disabled={loading}
              className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              title="Atualizar">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}/>
            </button>
            <button onClick={() => setShowExtrato(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
              <Upload className="w-4 h-4"/> Importar Extrato IA
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-32 gap-2 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400"/> Carregando...
          </div>
        ) : (
          <>
            {tab === "painel"       && <PainelTab allTxs={allTxs}/>}
            {tab === "mes"          && (
              <MesAtualTab
                allTxs={allTxs} txs={txs} monthDate={monthDate}
                clients={clients}
                onToggle={toggleTx} onDelete={deleteTx} onAdd={addTx} onAddSale={addSale}
              />
            )}
            {tab === "planejamento" && <PlanejamentoTab allTxs={allTxs} txs={txs}/>}
            {tab === "config"       && <ConfiguracoesTab/>}
            {tab === "lancamentos"  && (
              <LancamentosTab
                allTxs={allTxs} txs={txs} clients={clients}
                onToggle={toggleTx} onDelete={deleteTx} onAdd={addTx} onAddSale={addSale}
              />
            )}
          </>
        )}
      </div>

      {/* Extrato IA */}
      {showExtrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Importar Extrato com IA</h2>
                <p className="text-sm text-gray-400 mt-0.5">Upload do extrato — a IA classifica automaticamente</p>
              </div>
              <button onClick={() => setShowExtrato(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <ExtratoContent onClose={() => setShowExtrato(false)} onImport={txList => { setTxs(prev => [...prev, ...txList]); }}/>
          </div>
        </div>
      )}
    </div>
  );
}

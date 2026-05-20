"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, Upload, RefreshCw,
  X, Loader2, ExternalLink, BarChart3, Settings, FileText,
  LayoutGrid, Calendar, Pencil, Save,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────
type Tx = {
  id: string; type: "receita" | "despesa"; description: string; amount: number;
  category: string; status: string; dueDate?: string | null; paidAt?: string | null;
  paymentMethod?: string | null; notes?: string | null; clientId?: string | null;
  client?: { id: string; name: string } | null;
  _saleId?: string; _installmentId?: string;
};
type Installment = {
  id: string; number: number; amount: number; dueDate: string;
  paidAt?: string | null; status: string; notes?: string | null;
  label?: string | null; paymentMethod?: string | null;
};
type Sale = {
  id: string; description: string; totalAmount: number; installmentsCount: number;
  negotiationNotes?: string | null; paymentMethod?: string | null;
  negotiationType?: string | null; grossValue?: number | null; netValue?: number | null;
  cashFlowDate?: string | null; status: string; clientId: string; createdAt: string;
  client: { id: string; name: string }; installments: Installment[];
};
type Client = { id: string; name: string };
type FinConfig = { id: string; type: string; value: string; key?: string | null; order: number };
type MonthClose = {
  id?: string; month: string; saldoInicial: number; saldoBanco?: number | null;
  notes?: string | null; receitasProj?: number | null; custosFixos?: number | null;
  custosVar?: number | null; despesas?: number | null; investimentos?: number | null;
  prolabore?: number | null; reservas?: number | null; distLucros?: number | null;
};

// ─── Fallback Constants ───────────────────────────────────────────
const DEFAULT_INCOME_CATS  = ["Consultoria anual","Consultoria semestral","Consultoria trimestral","Aulas presenciais","Caixa","Faturamento","Parcela","Outros"];
const DEFAULT_EXPENSE_CATS = ["Custos fixos","Custos variáveis","Despesas","Investimentos","Pró-labore","Reservas"];
const DEFAULT_RECV_METHODS = ["Pix","Cartão","InfinitePay","Dinheiro","Plataforma","Outro"];
const DEFAULT_PAY_METHODS  = ["Pix PJ","Cartão PJ","Cartão PF","Dinheiro","Outro"];

const STATUSES_RECEITA = [
  { value: "pendente", label: "A RECEBER" },
  { value: "pago",     label: "RECEBIDO"  },
  { value: "atrasado", label: "ATRASADO"  },
  { value: "cancelado",label: "CANCELADO" },
];
const STATUSES_DESPESA = [
  { value: "pendente", label: "A PAGAR"   },
  { value: "pago",     label: "PAGO"      },
  { value: "atrasado", label: "ATRASADO"  },
  { value: "cancelado",label: "CANCELADO" },
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
  return !!dueDate && new Date(dueDate) < new Date();
}
function inMonth(d: Date, ds?: string | null) {
  if (!ds) return false;
  const dt = new Date(ds);
  return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth();
}
function txDate(tx: Tx) { return tx.paidAt || tx.dueDate || null; }
function monthStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

// ─── StatusBadge ──────────────────────────────────────────────────
function StatusBadge({ status, type, dueDate, onClick }: {
  status: string; type: "receita"|"despesa"; dueDate?: string|null; onClick?: ()=>void;
}) {
  const eff = (status==="pendente" && isOverdue(status,dueDate)) ? "atrasado" : status;
  const cfg: Record<string,{label:string;cls:string}> = {
    pendente:  {label: type==="receita"?"A RECEBER":"A PAGAR",  cls:"bg-amber-100 text-amber-700"},
    pago:      {label: type==="receita"?"RECEBIDO":"PAGO",      cls:"bg-green-100 text-green-700"},
    atrasado:  {label: "ATRASADO",                               cls:"bg-red-100 text-red-600"},
    cancelado: {label: "CANCELADO",                              cls:"bg-gray-100 text-gray-400"},
  };
  const {label,cls} = cfg[eff]||cfg["pendente"];
  return (
    <button onClick={onClick}
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls} ${onClick?"cursor-pointer hover:opacity-80":"cursor-default"}`}>
      {label}
    </button>
  );
}

// ─── Modal ────────────────────────────────────────────────────────
function Modal({title,subtitle,onClose,children}:{title:string;subtitle?:string;onClose:()=>void;children:React.ReactNode}) {
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

// ─── EditTxModal ──────────────────────────────────────────────────
function EditTxModal({ tx, clients, incomeCats, expenseCats, recvMethods, payMethods, onClose, onSave }: {
  tx: Tx; clients: Client[];
  incomeCats: string[]; expenseCats: string[];
  recvMethods: string[]; payMethods: string[];
  onClose: ()=>void;
  onSave: (data: Record<string,unknown>) => Promise<void>;
}) {
  const isVirtual = tx.id.startsWith("inst_");
  const isIncome = tx.type === "receita";
  const cats = isIncome ? incomeCats : expenseCats;
  const methods = isIncome ? recvMethods : payMethods;
  const statuses = isIncome ? STATUSES_RECEITA : STATUSES_DESPESA;

  const [form, setForm] = useState({
    description: tx.description,
    amount: String(tx.amount),
    category: tx.category,
    status: tx.status,
    dueDate: tx.dueDate ? tx.dueDate.slice(0,10) : "",
    paymentMethod: tx.paymentMethod || "",
    notes: tx.notes || "",
    clientId: tx.clientId || "",
  });
  const [saving, setSaving] = useState(false);

  const f = (k: string, v: string) => setForm(p => ({...p,[k]:v}));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      description: form.description,
      amount: parseFloat(form.amount.replace(",",".")),
      category: form.category,
      status: form.status,
      dueDate: form.dueDate || null,
      paymentMethod: form.paymentMethod || null,
      notes: form.notes || null,
      clientId: form.clientId || null,
    });
    setSaving(false);
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <Modal title="Editar Lançamento" subtitle={isVirtual ? "Parcela de venda — data, valor, status e forma editáveis" : ""} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {isVirtual && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            Vínculo com aluno/venda preservado. Apenas campos operacionais podem ser editados.
          </div>
        )}
        {!isVirtual && (
          <div>
            <label className={labelCls}>Descrição</label>
            <input value={form.description} onChange={e=>f("description",e.target.value)} className={inputCls}/>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Valor</label>
            <input value={form.amount} onChange={e=>f("amount",e.target.value)} type="number" step="0.01" className={inputCls}/>
          </div>
          <div>
            <label className={labelCls}>Data</label>
            <input type="date" value={form.dueDate} onChange={e=>f("dueDate",e.target.value)} className={inputCls}/>
          </div>
        </div>
        {!isVirtual && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Categoria</label>
              <select value={form.category} onChange={e=>f("category",e.target.value)} className={inputCls}>
                {cats.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {isIncome && (
              <div>
                <label className={labelCls}>Cliente</label>
                <select value={form.clientId} onChange={e=>f("clientId",e.target.value)} className={inputCls}>
                  <option value="">— Sem cliente —</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Forma</label>
            <select value={form.paymentMethod} onChange={e=>f("paymentMethod",e.target.value)} className={inputCls}>
              <option value="">—</option>
              {methods.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={e=>f("status",e.target.value)} className={inputCls}>
              {statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Observações</label>
          <textarea rows={2} value={form.notes} onChange={e=>f("notes",e.target.value)}
            className={`${inputCls} resize-none`}/>
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

// ─── NovaDespesaModal ─────────────────────────────────────────────
function NovaDespesaModal({ expenseCats, payMethods, onClose, onSave }: {
  expenseCats: string[]; payMethods: string[];
  onClose: ()=>void; onSave: (tx: Tx)=>void;
}) {
  const [form, setForm] = useState({
    description:"", amount:"", category:expenseCats[0]||"Despesas",
    paymentMethod:payMethods[0]||"Pix PJ", status:"pendente",
    dueDate: new Date().toISOString().slice(0,10), notes:"",
  });
  const [saving, setSaving] = useState(false);
  const f = (k:string,v:string)=>setForm(p=>({...p,[k]:v}));
  const cls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  async function handleSave(e:React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/financeiro/lancamentos",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...form,type:"despesa",amount:parseFloat(form.amount.replace(",","."))}),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <Modal title="Nova Conta a Pagar" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e=>f("description",e.target.value)} autoFocus className={cls}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Valor *</label>
            <input required value={form.amount} onChange={e=>f("amount",e.target.value)} type="number" step="0.01" className={cls}/></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Vencimento</label>
            <input type="date" value={form.dueDate} onChange={e=>f("dueDate",e.target.value)} className={cls}/></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
            <select value={form.category} onChange={e=>f("category",e.target.value)} className={cls}>
              {expenseCats.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Forma</label>
            <select value={form.paymentMethod} onChange={e=>f("paymentMethod",e.target.value)} className={cls}>
              {payMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={e=>f("status",e.target.value)} className={cls}>
            {STATUSES_DESPESA.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
            {saving?"Salvando...":"Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── NovaReceitaModal ─────────────────────────────────────────────
function NovaReceitaModal({ clients, incomeCats, recvMethods, onClose, onSave }: {
  clients: Client[]; incomeCats: string[]; recvMethods: string[];
  onClose: ()=>void; onSave: (tx: Tx)=>void;
}) {
  const [form, setForm] = useState({
    description:"", amount:"", category:incomeCats[0]||"Outros",
    paymentMethod:recvMethods[0]||"Pix", status:"pendente",
    dueDate: new Date().toISOString().slice(0,10), clientId:"",
  });
  const [saving, setSaving] = useState(false);
  const f = (k:string,v:string)=>setForm(p=>({...p,[k]:v}));
  const cls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  async function handleSave(e:React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/financeiro/lancamentos",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...form,type:"receita",amount:parseFloat(form.amount.replace(",","."))}),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <Modal title="Novo Recebimento" subtitle="Receita avulsa" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e=>f("description",e.target.value)} autoFocus className={cls}/></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Cliente</label>
          <select value={form.clientId} onChange={e=>f("clientId",e.target.value)} className={cls}>
            <option value="">— Sem cliente —</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Valor *</label>
            <input required value={form.amount} onChange={e=>f("amount",e.target.value)} type="number" step="0.01" className={cls}/></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Data</label>
            <input type="date" value={form.dueDate} onChange={e=>f("dueDate",e.target.value)} className={cls}/></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
            <select value={form.category} onChange={e=>f("category",e.target.value)} className={cls}>
              {incomeCats.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Forma</label>
            <select value={form.paymentMethod} onChange={e=>f("paymentMethod",e.target.value)} className={cls}>
              {recvMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={e=>f("status",e.target.value)} className={cls}>
            {STATUSES_RECEITA.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
            {saving?"Salvando...":"Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── NovaVendaModal ───────────────────────────────────────────────
function NovaVendaModal({ clients, recvMethods, onClose, onSave }: {
  clients: Client[]; recvMethods: string[];
  onClose: ()=>void; onSave: (sale: Sale)=>void;
}) {
  const [form, setForm] = useState({
    description:"", totalAmount:"", installmentsCount:"1",
    paymentMethod:recvMethods[0]||"Pix", clientId:"",
    firstDueDate: new Date().toISOString().slice(0,10), negotiationNotes:"",
  });
  const [saving, setSaving] = useState(false);
  const count = Math.max(1,parseInt(form.installmentsCount)||1);
  const total = parseFloat(form.totalAmount.replace(",","."))||0;
  const cls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400";

  async function handleSave(e:React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/vendas",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...form,totalAmount:total,installmentsCount:count}),
    });
    onSave(await res.json());
    setSaving(false);
  }

  return (
    <Modal title="Nova Venda Parcelada" subtitle="Gera parcelas automaticamente" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Cliente *</label>
          <select required value={form.clientId} onChange={e=>setForm(p=>({...p,clientId:e.target.value}))} className={cls}>
            <option value="">Selecione...</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
          <input required value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} autoFocus className={cls}/></div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="block text-xs font-semibold text-gray-600 mb-1">Valor Total *</label>
            <input required value={form.totalAmount} onChange={e=>setForm(p=>({...p,totalAmount:e.target.value}))} type="number" step="0.01" className={cls}/></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Parcelas</label>
            <input value={form.installmentsCount} onChange={e=>setForm(p=>({...p,installmentsCount:e.target.value}))} type="number" min="1" max="60" className={cls}/></div>
        </div>
        {total>0 && (
          <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
            <p className="text-xs text-indigo-600 font-semibold">{count}x de {fmt(total/count)} · Total: {fmt(total)}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">1ª Parcela</label>
            <input type="date" value={form.firstDueDate} onChange={e=>setForm(p=>({...p,firstDueDate:e.target.value}))} className={cls}/></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Forma</label>
            <select value={form.paymentMethod} onChange={e=>setForm(p=>({...p,paymentMethod:e.target.value}))} className={cls}>
              {recvMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={saving||!form.clientId} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
            {saving?"Criando...":`Criar ${count} parcela${count>1?"s":""}`}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── ExtratoContent ───────────────────────────────────────────────
function ExtratoContent({onClose,onImport}:{onClose:()=>void;onImport:(txs:Tx[])=>void}) {
  const [file,setFile]=useState<File|null>(null);
  const [parsing,setParsing]=useState(false);
  const [parsed,setParsed]=useState<(Omit<Tx,"id">&{date?:string})[]>([]);
  const [selected,setSelected]=useState<Set<number>>(new Set());
  const [importing,setImporting]=useState(false);

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    try {
      const fd=new FormData(); fd.append("file",file);
      const res=await fetch("/api/financeiro/extrato",{method:"POST",body:fd});
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data=await res.json();
      if (data.transactions) { setParsed(data.transactions); setSelected(new Set(data.transactions.map((_:unknown,i:number)=>i))); }
    } catch(err) { alert(`Não foi possível analisar.\n${err instanceof Error?err.message:String(err)}`); }
    finally { setParsing(false); }
  }

  async function handleImport() {
    setImporting(true);
    const results:Tx[]=[];
    for (const tx of parsed.filter((_,i)=>selected.has(i))) {
      const res=await fetch("/api/financeiro/lancamentos",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...tx,dueDate:(tx as {date?:string}).date||null,status:tx.status||"pago"}),
      });
      if (res.ok) results.push(await res.json());
    }
    onImport(results); setImporting(false); onClose();
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {parsed.length===0 ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Upload de extrato CSV/TXT. A IA classifica automaticamente.</p>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
            <input type="file" accept=".csv,.txt,.ofx" onChange={e=>setFile(e.target.files?.[0]||null)} className="hidden" id="ef"/>
            <label htmlFor="ef" className="cursor-pointer"><Upload className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
              <p className="text-sm text-gray-400">{file?file.name:"Clique para selecionar"}</p></label>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleParse} disabled={!file||parsing} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
              {parsing?"Analisando...":"Analisar com IA"}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">{parsed.length} transações encontradas</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {parsed.map((tx,i)=>(
              <div key={i} onClick={()=>setSelected(prev=>{const n=new Set(prev);n.has(i)?n.delete(i):n.add(i);return n;})}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer ${selected.has(i)?"border-indigo-200 bg-indigo-50":"border-gray-100"}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.has(i)?"bg-indigo-600 border-indigo-600":"border-gray-300"}`}>
                  {selected.has(i)&&<Check className="w-2.5 h-2.5 text-white"/>}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{tx.description}</p>
                  <p className="text-[10px] text-gray-400">{tx.category} · {(tx as {date?:string}).date}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${tx.type==="receita"?"text-green-600":"text-red-600"}`}>
                  {tx.type==="despesa"?"−":"+"}{fmt(tx.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setParsed([])} className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Voltar</button>
            <button onClick={handleImport} disabled={selected.size===0||importing} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50">
              {importing?"Importando...":`Importar ${selected.size}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba 1: Painel ────────────────────────────────────────────────
const GOAL_LABELS: Record<string,string> = {
  cap_giro:    "Capital de giro",
  rec_mensal:  "Projeção de receita mensal",
  reserva_fin: "Reserva financeira",
  reserva_oport:"Reserva de oportunidades",
  dist_lucros: "Distribuição de lucros (%)",
};

function PainelTab({ allTxs, goals, onSaveGoal }: {
  allTxs: Tx[];
  goals: Record<string,string>;
  onSaveGoal: (key:string, value:string) => Promise<void>;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Record<string,string>>(goals);
  const [savingGoals, setSavingGoals] = useState(false);

  useEffect(() => { setGoalDraft(goals); }, [goals]);

  const months = Array.from({length:12},(_,m)=>{
    const md = new Date(year,m,1);
    const recs = allTxs.filter(t=>t.type==="receita"&&(inMonth(md,t.dueDate)||inMonth(md,t.paidAt)));
    const desp = allTxs.filter(t=>t.type==="despesa"&&(inMonth(md,t.dueDate)||inMonth(md,t.paidAt)));
    const realR = recs.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
    const totalR = recs.reduce((s,t)=>s+t.amount,0);
    const realD = desp.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
    const resultado = realR-realD;
    const margem = realR>0?(resultado/realR)*100:null;
    return {m,totalR,realR,realD,resultado,margem};
  });

  const anoR = months.reduce((s,m)=>s+m.realR,0);
  const anoD = months.reduce((s,m)=>s+m.realD,0);
  const anoResult = anoR-anoD;
  const anoMargem = anoR>0?(anoResult/anoR)*100:null;

  async function handleSaveGoals() {
    setSavingGoals(true);
    for (const [k,v] of Object.entries(goalDraft)) {
      await onSaveGoal(k,v);
    }
    setSavingGoals(false);
    setEditingGoals(false);
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:`Receitas ${year}`,val:anoR,color:"text-green-600",sub:"realizadas no ano"},
          {label:`Despesas ${year}`,val:anoD,color:"text-red-500",sub:"pagas no ano"},
          {label:`Resultado ${year}`,val:anoResult,color:anoResult>=0?"text-green-600":"text-red-600",sub:"receitas − despesas"},
          {label:`Margem ${year}`,val:null,color:"text-indigo-600",sub:"resultado / receitas",pct:anoMargem},
        ].map((k,i)=>(
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.pct!==undefined?(k.pct!==null?`${k.pct.toFixed(1)}%`:"—"):fmt(k.val!)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Metas e reservas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700">Metas e Reservas</h2>
          {!editingGoals ? (
            <button onClick={()=>setEditingGoals(true)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline font-medium">
              <Pencil className="w-3 h-3"/> Editar metas
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={()=>setEditingGoals(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
              <button onClick={handleSaveGoals} disabled={savingGoals}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 px-3 py-1 rounded-lg disabled:opacity-50">
                <Save className="w-3 h-3"/>{savingGoals?"Salvando...":"Salvar"}
              </button>
            </div>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {Object.entries(GOAL_LABELS).map(([key,label])=>{
            const val = goals[key] || "";
            const isPercent = key === "dist_lucros";
            return (
              <div key={key} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-600">{label}</span>
                {editingGoals ? (
                  <input
                    value={goalDraft[key]||""}
                    onChange={e=>setGoalDraft(p=>({...p,[key]:e.target.value}))}
                    type="number" step="0.01" placeholder="0"
                    className="border border-gray-200 rounded px-2 py-1 text-sm w-32 text-right focus:outline-none focus:border-indigo-400"/>
                ) : (
                  <span className="text-sm font-semibold text-gray-800">
                    {val ? (isPercent ? `${val}%` : fmt(parseFloat(val)||0)) : <span className="text-gray-300 text-xs">— não definido</span>}
                  </span>
                )}
              </div>
            );
          })}
          {/* Receita mensal: meta vs realizado */}
          {goals["rec_mensal"] && (
            <div className="px-5 py-2 bg-gray-50/50">
              <p className="text-[10px] text-gray-400">
                Mês atual realizado: <span className="font-semibold text-green-600">{fmt(months[today.getMonth()]?.realR||0)}</span>
                {" "}/ meta: <span className="font-semibold">{fmt(parseFloat(goals["rec_mensal"])||0)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700">Resumo mensal — {year}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Mês</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Receitas</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Despesas</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Resultado</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Margem</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({m,totalR,realR,realD,resultado,margem})=>{
                const isCur = m===today.getMonth();
                const noData = realR===0&&realD===0&&totalR===0;
                return (
                  <tr key={m} className={`border-t border-gray-50 ${isCur?"bg-indigo-50/40":"hover:bg-gray-50/50"} ${noData?"opacity-40":""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-700">
                      {MONTHS[m]}
                      {isCur&&<span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">atual</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-sm font-semibold text-green-600">{fmt(realR)}</span>
                      {totalR>realR&&<span className="text-[10px] text-gray-400 ml-1">/ {fmt(totalR)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-red-500">{realD>0?fmt(realD):"—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {(realR>0||realD>0)?<span className={`text-sm font-semibold ${resultado>=0?"text-green-600":"text-red-600"}`}>{fmt(resultado)}</span>:<span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-indigo-600">{margem!==null?`${margem.toFixed(1)}%`:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-green-600">{fmt(anoR)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-red-500">{fmt(anoD)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold" style={{color:anoResult>=0?"#16a34a":"#dc2626"}}>{fmt(anoResult)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-600">{anoMargem!==null?`${anoMargem.toFixed(1)}%`:"—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Aba 2: Mês Atual ─────────────────────────────────────────────
function MesAtualTab({ allTxs, txs, monthDate, clients, incomeCats, expenseCats, recvMethods, payMethods,
  monthClose, onSaveClose, onToggle, onDelete, onAdd, onAddSale, onEditTx, onUpdateTx, onUpdateInstallment }: {
  allTxs: Tx[]; txs: Tx[]; monthDate: Date; clients: Client[];
  incomeCats: string[]; expenseCats: string[]; recvMethods: string[]; payMethods: string[];
  monthClose: MonthClose | null;
  onSaveClose: (data: Partial<MonthClose>) => Promise<void>;
  onToggle: (id:string,status:string)=>void;
  onDelete: (id:string)=>void;
  onAdd: (tx:Tx)=>void;
  onAddSale: (sale:Sale)=>void;
  onEditTx: (tx:Tx)=>void;
  onUpdateTx: (id:string, data:Partial<Tx>) => void;
  onUpdateInstallment: (saleId:string, instId:string, data:Partial<Installment>) => void;
}) {
  const [saldoI, setSaldoI] = useState(String(monthClose?.saldoInicial??""));
  const [saldoB, setSaldoB] = useState(monthClose?.saldoBanco!=null?String(monthClose.saldoBanco):"");
  const [notes, setNotes] = useState(monthClose?.notes||"");
  const [modal, setModal] = useState<null|"receita"|"despesa"|"venda">(null);
  const [editTx, setEditTx] = useState<Tx|null>(null);
  const [savingField, setSavingField] = useState<string|null>(null);
  const [savedField, setSavedField] = useState<string|null>(null);

  useEffect(()=>{
    setSaldoI(String(monthClose?.saldoInicial??""));
    setSaldoB(monthClose?.saldoBanco!=null?String(monthClose.saldoBanco):"");
    setNotes(monthClose?.notes||"");
  },[monthClose]);

  async function saveField(field: string, raw: string) {
    setSavingField(field);
    const num = parseFloat(raw.replace(",","."));
    await onSaveClose({ [field]: isNaN(num) ? null : num });
    setSavingField(null);
    setSavedField(field);
    setTimeout(()=>setSavedField(f=>f===field?null:f),2000);
  }
  async function saveNotes() {
    setSavingField("notes");
    await onSaveClose({ notes: notes||null });
    setSavingField(null);
    setSavedField("notes");
    setTimeout(()=>setSavedField(f=>f==="notes"?null:f),2000);
  }

  const mRecs = allTxs.filter(t=>t.type==="receita"&&(inMonth(monthDate,t.dueDate)||inMonth(monthDate,t.paidAt)))
    .sort((a,b)=>new Date(txDate(a)||"").getTime()-new Date(txDate(b)||"").getTime());
  const mDesp = txs.filter(t=>t.type==="despesa"&&(inMonth(monthDate,t.dueDate)||inMonth(monthDate,t.paidAt)))
    .sort((a,b)=>new Date(txDate(a)||"").getTime()-new Date(txDate(b)||"").getTime());

  const entradas = mRecs.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
  const saidas   = mDesp.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
  const saldoINum = parseFloat(saldoI.replace(",","."))||0;
  const saldoCalc = saldoINum+entradas-saidas;
  const saldoBNum = parseFloat(saldoB.replace(",","."))||0;
  const diff = saldoB!==""?saldoCalc-saldoBNum:null;

  const aPagar   = mDesp.filter(t=>t.status!=="pago"&&t.status!=="cancelado");
  const aReceber = mRecs.filter(t=>t.status!=="pago"&&t.status!=="cancelado");
  const vencidas = aReceber.filter(t=>isOverdue(t.status,t.dueDate));

  const totalRec = mRecs.reduce((s,t)=>s+t.amount,0);
  const totalDesp= mDesp.reduce((s,t)=>s+t.amount,0);
  const resultado= entradas-saidas;
  const margem   = entradas>0?(resultado/entradas)*100:null;

  const despByCat = expenseCats.map(cat=>({
    cat, total:mDesp.filter(t=>t.category===cat).reduce((s,t)=>s+t.amount,0),
    pago:mDesp.filter(t=>t.category===cat&&t.status==="pago").reduce((s,t)=>s+t.amount,0),
  })).filter(c=>c.total>0);
  const outrosCat = mDesp.filter(t=>!expenseCats.includes(t.category));
  if (outrosCat.length) despByCat.push({cat:"Outros",total:outrosCat.reduce((s,t)=>s+t.amount,0),pago:outrosCat.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0)});

  const iCls = "border border-gray-200 rounded px-2 py-1 text-sm w-36 focus:outline-none focus:border-indigo-400 text-right bg-white";

  return (
    <div className="space-y-8">
      {/* Balanço Geral */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Balanço Geral</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-5 py-3 text-gray-500">Saldo inicial<span className="ml-1.5 text-[10px] text-gray-300">manual</span></td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {savingField==="saldoInicial"&&<span className="text-[10px] text-gray-400">salvando...</span>}
                    {savedField==="saldoInicial"&&<span className="text-[10px] text-green-500">salvo ✓</span>}
                    <input value={saldoI} onChange={e=>setSaldoI(e.target.value)} onBlur={()=>saveField("saldoInicial",saldoI)}
                      type="number" step="0.01" placeholder="0,00" className={iCls}/>
                  </div>
                </td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-5 py-3 text-gray-500">Entradas do mês<span className="ml-1.5 text-[10px] text-green-400">automático</span></td>
                <td className="px-5 py-3 text-right font-semibold text-green-600">{fmt(entradas)}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-5 py-3 text-gray-500">Saídas do mês<span className="ml-1.5 text-[10px] text-red-300">automático</span></td>
                <td className="px-5 py-3 text-right font-semibold text-red-500">{fmt(saidas)}</td>
              </tr>
              <tr className="border-b border-gray-50 bg-gray-50">
                <td className="px-5 py-3 font-semibold text-gray-700">Saldo calculado</td>
                <td className="px-5 py-3 text-right text-base font-bold" style={{color:saldoCalc>=0?"#374151":"#dc2626"}}>{fmt(saldoCalc)}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-5 py-3 text-gray-500">Saldo banco<span className="ml-1.5 text-[10px] text-gray-300">opcional</span></td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {savingField==="saldoBanco"&&<span className="text-[10px] text-gray-400">salvando...</span>}
                    {savedField==="saldoBanco"&&<span className="text-[10px] text-green-500">salvo ✓</span>}
                    <input value={saldoB} onChange={e=>setSaldoB(e.target.value)} onBlur={()=>saveField("saldoBanco",saldoB)}
                      type="number" step="0.01" placeholder="—" className={iCls}/>
                  </div>
                </td>
              </tr>
              {diff!==null&&(
                <tr className="border-b border-gray-50">
                  <td className="px-5 py-3 font-semibold text-gray-600">Diferença</td>
                  <td className="px-5 py-3 text-right font-semibold" style={{color:Math.abs(diff)<0.01?"#16a34a":"#d97706"}}>{fmt(diff)}</td>
                </tr>
              )}
              <tr>
                <td className="px-5 py-3 text-gray-500">Observações</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {savingField==="notes"&&<span className="text-[10px] text-gray-400">salvando...</span>}
                    {savedField==="notes"&&<span className="text-[10px] text-green-500">salvo ✓</span>}
                    <input value={notes} onChange={e=>setNotes(e.target.value)} onBlur={saveNotes}
                      placeholder="Notas do fechamento..." className="border border-gray-200 rounded px-2 py-1 text-sm w-64 focus:outline-none focus:border-indigo-400"/>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Pendências */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Pendências</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
            <p className="text-[10px] text-amber-500 uppercase font-bold mb-1">A Pagar</p>
            <p className="text-xl font-bold text-amber-600">{fmt(aPagar.reduce((s,t)=>s+t.amount,0))}</p>
            <p className="text-xs text-gray-400 mt-0.5">{aPagar.length} lançamento{aPagar.length!==1?"s":""}</p>
          </div>
          <div className={`bg-white rounded-xl border shadow-sm p-4 ${vencidas.length>0?"border-red-100":"border-amber-100"}`}>
            <p className={`text-[10px] uppercase font-bold mb-1 ${vencidas.length>0?"text-red-500":"text-amber-500"}`}>A Receber</p>
            <p className={`text-xl font-bold ${vencidas.length>0?"text-red-600":"text-amber-600"}`}>{fmt(aReceber.reduce((s,t)=>s+t.amount,0))}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {aReceber.length} pendente{aReceber.length!==1?"s":""}
              {vencidas.length>0&&<span className="ml-1.5 text-red-400 font-semibold">· {vencidas.length} vencida{vencidas.length!==1?"s":""}</span>}
            </p>
          </div>
        </div>
      </section>

      {/* Resumo */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Resumo do Mês</h2>
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
                <td className="px-5 py-2.5 text-right text-xs text-gray-300">{fmt(totalRec)}</td>
                <td className="px-5 py-2.5 text-right font-semibold text-green-600">{fmt(entradas)}</td>
              </tr>
              {despByCat.map(c=>(
                <tr key={c.cat} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 text-gray-600">{c.cat}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-gray-400">{fmt(c.total)}</td>
                  <td className="px-5 py-2.5 text-right text-red-500">{c.pago>0?fmt(c.pago):"—"}</td>
                </tr>
              ))}
              {despByCat.length===0&&<tr><td colSpan={3} className="px-5 py-2.5 text-gray-400 italic text-xs">Nenhuma despesa lançada</td></tr>}
              <tr className="border-b border-gray-100 bg-gray-50">
                <td className="px-5 py-2.5 font-semibold text-gray-700">Total despesas</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-400">{fmt(totalDesp)}</td>
                <td className="px-5 py-2.5 text-right font-semibold text-red-500">{fmt(saidas)}</td>
              </tr>
              <tr className={`border-b border-gray-100 ${resultado>=0?"bg-green-50/40":"bg-red-50/40"}`}>
                <td className="px-5 py-2.5 font-bold text-gray-800">Resultado</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-400">{fmt(totalRec-totalDesp)}</td>
                <td className={`px-5 py-2.5 text-right font-bold text-base ${resultado>=0?"text-green-600":"text-red-600"}`}>{fmt(resultado)}</td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-semibold text-gray-600">Margem de lucro</td>
                <td className="px-5 py-2.5 text-right text-xs text-gray-300">—</td>
                <td className="px-5 py-2.5 text-right font-semibold text-indigo-600">{margem!==null?`${margem.toFixed(1)}%`:"—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Recebimentos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recebimentos</h2>
          <div className="flex gap-2">
            <button onClick={()=>setModal("receita")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700">
              <Plus className="w-3 h-3"/> Receita</button>
            <button onClick={()=>setModal("venda")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-3 h-3"/> Nova Venda</button>
          </div>
        </div>
        <TxTable txs={mRecs} type="receita" onToggle={onToggle} onDelete={onDelete} onEdit={tx=>{setEditTx(tx);onEditTx(tx);}}/>
      </section>

      {/* Pagamentos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pagamentos</h2>
          <button onClick={()=>setModal("despesa")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600">
            <Plus className="w-3 h-3"/> Nova Despesa</button>
        </div>
        <TxTable txs={mDesp} type="despesa" onToggle={onToggle} onDelete={onDelete} onEdit={tx=>{setEditTx(tx);onEditTx(tx);}}/>
      </section>

      {modal==="receita"&&<NovaReceitaModal clients={clients} incomeCats={incomeCats} recvMethods={recvMethods} onClose={()=>setModal(null)} onSave={tx=>{onAdd(tx);setModal(null);}}/>}
      {modal==="despesa"&&<NovaDespesaModal expenseCats={expenseCats} payMethods={payMethods} onClose={()=>setModal(null)} onSave={tx=>{onAdd(tx);setModal(null);}}/>}
      {modal==="venda"&&<NovaVendaModal clients={clients} recvMethods={recvMethods} onClose={()=>setModal(null)} onSave={sale=>{onAddSale(sale);setModal(null);}}/>}
      {editTx&&(
        <EditTxModal tx={editTx} clients={clients} incomeCats={incomeCats} expenseCats={expenseCats}
          recvMethods={recvMethods} payMethods={payMethods} onClose={()=>setEditTx(null)}
          onSave={async(data)=>{await handleEditSave(editTx,data);setEditTx(null);}}/>
      )}
    </div>
  );

  async function handleEditSave(tx: Tx, data: Record<string,unknown>) {
    if (tx.id.startsWith("inst_")&&tx._saleId&&tx._installmentId) {
      const res = await fetch(`/api/financeiro/vendas/${tx._saleId}/parcelas/${tx._installmentId}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),
      });
      if (res.ok) { const updated=await res.json(); onUpdateInstallment(tx._saleId,tx._installmentId,updated); }
    } else {
      const res = await fetch(`/api/financeiro/lancamentos/${tx.id}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),
      });
      if (res.ok) { const updated=await res.json(); onUpdateTx(tx.id,updated); }
    }
  }
}

// ─── TxTable (shared) ─────────────────────────────────────────────
function TxTable({txs,type,onToggle,onDelete,onEdit}:{
  txs:Tx[]; type:"receita"|"despesa";
  onToggle:(id:string,status:string)=>void;
  onDelete:(id:string)=>void;
  onEdit:(tx:Tx)=>void;
}) {
  if (txs.length===0) return (
    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
      Nenhum {type==="receita"?"recebimento":"pagamento"} neste mês
    </div>
  );
  const isIncome = type==="receita";
  const totalAll = txs.reduce((s,t)=>s+t.amount,0);
  const totalPago = txs.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Data</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase">Valor</th>
            {isIncome&&<th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden md:table-cell">Cliente</th>}
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden lg:table-cell">Categoria</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden xl:table-cell">Forma</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase hidden md:table-cell">Descrição</th>
            <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase">Status</th>
            <th className="w-16"/>
          </tr>
        </thead>
        <tbody>
          {txs.map(tx=>{
            const isVirtual = tx.id.startsWith("inst_")||tx.id.startsWith("rev_");
            const over = isOverdue(tx.status,tx.dueDate);
            return (
              <tr key={tx.id} className={`border-t border-gray-50 hover:bg-gray-50/50 group ${over&&tx.status!=="pago"?"bg-red-50/20":""}`}>
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(txDate(tx))}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-sm" style={{color:tx.status==="pago"?(isIncome?"#16a34a":"#dc2626"):"#374151"}}>
                  {fmt(tx.amount)}</td>
                {isIncome&&(
                  <td className="px-4 py-2.5 text-xs text-gray-600 hidden md:table-cell">
                    {tx.client?<Link href={`/alunos?open=${tx.client.id}`} className="hover:text-indigo-600 flex items-center gap-1 group/l">
                      {tx.client.name}<ExternalLink className="w-3 h-3 opacity-0 group-hover/l:opacity-100"/></Link>:"—"}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell truncate max-w-[100px]">{tx.category}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 hidden xl:table-cell">{tx.paymentMethod||"—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell truncate max-w-[120px]">{tx.description}</td>
                <td className="px-4 py-2.5 text-center">
                  <StatusBadge status={tx.status} type={type} dueDate={tx.dueDate}
                    onClick={()=>onToggle(tx.id,tx.status==="pago"?"pendente":"pago")}/>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={()=>onEdit(tx)} title="Editar"
                      className="p-1 rounded hover:bg-indigo-50 text-gray-300 hover:text-indigo-500">
                      <Pencil className="w-3.5 h-3.5"/></button>
                    {!isVirtual&&(
                      <button onClick={()=>onDelete(tx.id)} title="Excluir"
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5"/></button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-100 bg-gray-50">
            <td colSpan={isIncome?2:2} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Total</td>
            <td colSpan={isIncome?6:5} className="px-4 py-2.5 text-right">
              <span className={`font-bold text-sm ${isIncome?"text-green-600":"text-red-500"}`}>{fmt(totalAll)}</span>
              <span className="ml-2 text-xs text-gray-400">{isIncome?"recebido":"pago"}: {fmt(totalPago)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Aba 3: Planejamento Anual ────────────────────────────────────
function PlanejamentoTab({ allTxs, txs, monthCloses, onSaveClose }: {
  allTxs: Tx[]; txs: Tx[];
  monthCloses: Record<string,MonthClose>;
  onSaveClose: (month:string, data:Partial<MonthClose>) => Promise<void>;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [editing, setEditing] = useState<{month:string;field:string}|null>(null);
  const [draft, setDraft] = useState("");
  const [savingCell, setSavingCell] = useState(false);

  const projFields: {field: keyof MonthClose; label: string}[] = [
    {field:"receitasProj",label:"Rec. Proj."},
    {field:"custosFixos",label:"C. Fixos"},
    {field:"custosVar",label:"C. Var."},
    {field:"despesas",label:"Despesas"},
    {field:"investimentos",label:"Invest."},
  ];

  const months = Array.from({length:12},(_,m)=>{
    const md = new Date(year,m,1);
    const mk = `${year}-${String(m+1).padStart(2,"0")}`;
    const mc = monthCloses[mk];
    const recs = allTxs.filter(t=>t.type==="receita"&&(inMonth(md,t.dueDate)||inMonth(md,t.paidAt)));
    const desp = txs.filter(t=>t.type==="despesa"&&(inMonth(md,t.dueDate)||inMonth(md,t.paidAt)));
    const realR = recs.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
    const realD = desp.filter(t=>t.status==="pago").reduce((s,t)=>s+t.amount,0);
    const resultado = realR-realD;
    const margem = realR>0?(resultado/realR)*100:null;
    const getProj = (f: keyof MonthClose) => (mc?.[f] as number|null|undefined) ?? null;
    return {m,mk,realR,realD,resultado,margem,mc,getProj};
  });

  function startEdit(month:string, field:string, current:number|null) {
    setEditing({month,field});
    setDraft(current!=null?String(current):"");
  }

  async function commitEdit() {
    if (!editing||savingCell) return;
    const num = parseFloat(draft.replace(",","."));
    setSavingCell(true);
    await onSaveClose(editing.month,{[editing.field]:isNaN(num)?null:num});
    setSavingCell(false);
    setEditing(null);
  }

  const cellCls = "px-3 py-2 text-right text-xs cursor-pointer hover:bg-indigo-50/50 group/cell transition-colors";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Planejamento Anual</h2>
        <div className="flex items-center gap-1 ml-auto border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={()=>setYear(y=>y-1)} className="p-1.5 hover:bg-gray-50"><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
          <span className="px-3 text-sm font-semibold text-gray-700 min-w-[60px] text-center">{year}</span>
          <button onClick={()=>setYear(y=>y+1)} className="p-1.5 hover:bg-gray-50"><ChevronRight className="w-4 h-4 text-gray-500"/></button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">Clique em qualquer célula <span className="font-semibold text-indigo-500">Projetado</span> para editar. Realizados calculados automaticamente.</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase sticky left-0 bg-gray-50">Mês</th>
                {projFields.map(pf=>(
                  <th key={pf.field} className="px-3 py-3 text-right text-[10px] font-semibold text-indigo-400 uppercase">{pf.label}<br/><span className="text-gray-300 font-normal normal-case">proj.</span></th>
                ))}
                <th className="px-3 py-3 text-right text-[10px] font-semibold text-green-500 uppercase">Rec. Real.</th>
                <th className="px-3 py-3 text-right text-[10px] font-semibold text-red-400 uppercase">Desp. Real.</th>
                <th className="px-3 py-3 text-right text-[10px] font-semibold text-gray-500 uppercase">Resultado</th>
                <th className="px-3 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase">Margem</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({m,mk,realR,realD,resultado,margem,getProj})=>{
                const isCur = m===new Date().getMonth()&&year===currentYear;
                const noData = realR===0&&realD===0;
                return (
                  <tr key={m} className={`border-t border-gray-50 ${isCur?"bg-indigo-50/40":"hover:bg-gray-50/30"} ${noData?"opacity-50":""}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-inherit">
                      {MONTHS[m].slice(0,3)}{isCur&&<span className="ml-1 text-[9px] text-indigo-500 font-bold">▸</span>}
                    </td>
                    {projFields.map(pf=>{
                      const isEd = editing?.month===mk&&editing?.field===pf.field;
                      const val = getProj(pf.field);
                      return (
                        <td key={pf.field} className={cellCls} onClick={()=>!isEd&&startEdit(mk,pf.field,val)}>
                          {isEd ? (
                            <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
                              onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")setEditing(null);}}
                              disabled={savingCell}
                              className={`w-20 border border-indigo-300 rounded px-1 py-0.5 text-xs focus:outline-none text-right bg-white ${savingCell?"opacity-50 cursor-wait":""}`}
                              type="number" step="0.01"/>
                          ) : (
                            <span className={`${val!=null?"text-indigo-600 font-medium":"text-gray-200"} group-hover/cell:text-indigo-500`}>
                              {val!=null?fmt(val):"+ add"}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-semibold text-green-600">{realR>0?fmt(realR):"—"}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{realD>0?fmt(realD):"—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold" style={{color:(realR>0||realD>0)?(resultado>=0?"#16a34a":"#dc2626"):"#d1d5db"}}>
                      {(realR>0||realD>0)?fmt(resultado):"—"}</td>
                    <td className="px-3 py-2.5 text-right text-indigo-600">{margem!==null?`${margem.toFixed(1)}%`:"—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase sticky left-0 bg-gray-50">Total</td>
                {projFields.map(pf=>{
                  const total = months.reduce((s,row)=>s+(row.getProj(pf.field)??0),0);
                  return <td key={pf.field} className="px-3 py-3 text-right text-xs font-semibold text-indigo-600">{total>0?fmt(total):"—"}</td>;
                })}
                <td className="px-3 py-3 text-right text-xs font-bold text-green-600">{fmt(months.reduce((s,r)=>s+r.realR,0))}</td>
                <td className="px-3 py-3 text-right text-xs font-semibold text-red-500">{fmt(months.reduce((s,r)=>s+r.realD,0))}</td>
                <td className="px-3 py-3 text-right text-xs font-bold" style={{color:months.reduce((s,r)=>s+r.resultado,0)>=0?"#16a34a":"#dc2626"}}>
                  {fmt(months.reduce((s,r)=>s+r.resultado,0))}</td>
                <td className="px-3 py-3 text-right text-xs text-gray-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Aba 4: Configurações ─────────────────────────────────────────
function ConfiguracoesTab({ configs, onAdd, onDelete }: {
  configs: FinConfig[];
  onAdd: (type:string,value:string) => Promise<void>;
  onDelete: (id:string) => Promise<void>;
}) {
  const sections: {type:string;title:string;color:string}[] = [
    {type:"income_cat",  title:"Categorias de Receita",   color:"green"},
    {type:"expense_cat", title:"Categorias de Saída",      color:"red"},
    {type:"recv_method", title:"Formas de Recebimento",    color:"blue"},
    {type:"pay_method",  title:"Formas de Pagamento",      color:"purple"},
  ];

  const colorMap: Record<string,{hdr:string;text:string;badge:string;btn:string}> = {
    green:  {hdr:"border-green-100 bg-green-50",   text:"text-green-700",  badge:"bg-green-100 text-green-700",  btn:"bg-green-600 hover:bg-green-700"},
    red:    {hdr:"border-red-100 bg-red-50",       text:"text-red-700",    badge:"bg-red-100 text-red-600",      btn:"bg-red-500 hover:bg-red-600"},
    blue:   {hdr:"border-blue-100 bg-blue-50",     text:"text-blue-700",   badge:"bg-blue-100 text-blue-700",    btn:"bg-blue-600 hover:bg-blue-700"},
    purple: {hdr:"border-purple-100 bg-purple-50", text:"text-purple-700", badge:"bg-purple-100 text-purple-700",btn:"bg-purple-600 hover:bg-purple-700"},
  };

  function ConfigSection({type,title,color}:{type:string;title:string;color:string}) {
    const items = configs.filter(c=>c.type===type);
    const c = colorMap[color];
    const [newVal,setNewVal] = useState("");
    const [adding,setAdding] = useState(false);
    const [saving,setSaving] = useState(false);

    async function handleAdd() {
      if (!newVal.trim()) return;
      setSaving(true);
      await onAdd(type,newVal.trim());
      setNewVal("");
      setAdding(false);
      setSaving(false);
    }

    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className={`px-4 py-3 border-b ${c.hdr} flex items-center justify-between`}>
          <h3 className={`text-sm font-bold ${c.text}`}>{title}</h3>
          <span className="text-xs text-gray-400">{items.length} item{items.length!==1?"s":""}</span>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {items.map(item=>(
            <div key={item.id} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${c.badge}`}>
              {item.value}
              <button onClick={()=>onDelete(item.id)} className="ml-1 opacity-60 hover:opacity-100 hover:text-red-600 transition-opacity">
                <X className="w-3 h-3"/></button>
            </div>
          ))}
          {items.length===0&&<p className="text-xs text-gray-400 italic">Nenhum item</p>}
        </div>
        <div className="px-4 pb-3">
          {adding ? (
            <div className="flex gap-2">
              <input autoFocus value={newVal} onChange={e=>setNewVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")handleAdd();if(e.key==="Escape")setAdding(false);}}
                placeholder="Nome do item..." className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400"/>
              <button onClick={handleAdd} disabled={saving||!newVal.trim()}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 ${c.btn}`}>
                {saving?"...":"Adicionar"}</button>
              <button onClick={()=>setAdding(false)} className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-50">Cancelar</button>
            </div>
          ) : (
            <button onClick={()=>setAdding(true)}
              className={`flex items-center gap-1 text-xs font-medium ${c.text} hover:opacity-80`}>
              <Plus className="w-3 h-3"/> Adicionar item
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Gerencie as categorias e formas usadas nos lançamentos. Alterações refletem imediatamente nos formulários.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(s=><ConfigSection key={s.type} {...s}/>)}
      </div>
    </div>
  );
}

// ─── Aba 5: Lançamentos ───────────────────────────────────────────
function LancamentosTab({ allTxs, txs, clients, incomeCats, expenseCats, recvMethods, payMethods,
  onToggle, onDelete, onAdd, onAddSale, onUpdateTx, onUpdateInstallment }: {
  allTxs: Tx[]; txs: Tx[]; clients: Client[];
  incomeCats: string[]; expenseCats: string[]; recvMethods: string[]; payMethods: string[];
  onToggle:(id:string,status:string)=>void;
  onDelete:(id:string)=>void;
  onAdd:(tx:Tx)=>void;
  onAddSale:(sale:Sale)=>void;
  onUpdateTx:(id:string,data:Partial<Tx>)=>void;
  onUpdateInstallment:(saleId:string,instId:string,data:Partial<Installment>)=>void;
}) {
  const today = new Date();
  const [tipo,setTipo] = useState<"todos"|"receita"|"despesa">("todos");
  const [month,setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`);
  const [catF,setCatF] = useState("");
  const [stF,setStF] = useState("");
  const [cliF,setCliF] = useState("");
  const [methF,setMethF] = useState("");
  const [modal,setModal] = useState<null|"receita"|"despesa"|"venda">(null);
  const [editTx,setEditTx] = useState<Tx|null>(null);

  const base = tipo==="despesa" ? txs.filter(t=>t.type==="despesa") : allTxs;
  const allCats = [...new Set(base.map(t=>t.category))].sort();
  const allMethods = [...new Set(base.map(t=>t.paymentMethod).filter(Boolean))].sort() as string[];

  const filtered = base.filter(t=>{
    if (tipo!=="todos"&&t.type!==tipo) return false;
    if (month) {
      const [y,m2]=month.split("-").map(Number);
      const md=new Date(y,m2-1,1);
      if (!inMonth(md,t.dueDate)&&!inMonth(md,t.paidAt)) return false;
    }
    if (catF&&t.category!==catF) return false;
    if (stF&&t.status!==stF) return false;
    if (cliF&&t.client?.id!==cliF) return false;
    if (methF&&t.paymentMethod!==methF) return false;
    return true;
  }).sort((a,b)=>new Date(txDate(b)||"").getTime()-new Date(txDate(a)||"").getTime());

  const totE = filtered.filter(t=>t.type==="receita").reduce((s,t)=>s+t.amount,0);
  const totS = filtered.filter(t=>t.type==="despesa").reduce((s,t)=>s+t.amount,0);

  const sCls = "border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400 bg-white";

  async function handleEditSave(tx: Tx, data: Record<string,unknown>) {
    if (tx.id.startsWith("inst_")&&tx._saleId&&tx._installmentId) {
      const res = await fetch(`/api/financeiro/vendas/${tx._saleId}/parcelas/${tx._installmentId}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),
      });
      if (res.ok) { const updated=await res.json(); onUpdateInstallment(tx._saleId,tx._installmentId,updated); }
    } else {
      const res = await fetch(`/api/financeiro/lancamentos/${tx.id}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),
      });
      if (res.ok) { const updated=await res.json(); onUpdateTx(tx.id,updated); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {(["todos","receita","despesa"] as const).map(t=>(
            <button key={t} onClick={()=>setTipo(t)} className={`px-3 py-1.5 transition-colors ${tipo===t?"bg-indigo-600 text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>
              {t==="todos"?"Todos":t==="receita"?"Entradas":"Saídas"}</button>
          ))}
        </div>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className={sCls}/>
        <select value={catF} onChange={e=>setCatF(e.target.value)} className={sCls}>
          <option value="">Categoria</option>
          {allCats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select value={stF} onChange={e=>setStF(e.target.value)} className={sCls}>
          <option value="">Status</option>
          <option value="pago">Pago/Recebido</option>
          <option value="pendente">A Pagar/A Receber</option>
          <option value="atrasado">Atrasado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select value={cliF} onChange={e=>setCliF(e.target.value)} className={sCls}>
          <option value="">Cliente</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={methF} onChange={e=>setMethF(e.target.value)} className={sCls}>
          <option value="">Forma</option>
          {allMethods.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        {(catF||stF||cliF||methF)&&(
          <button onClick={()=>{setCatF("");setStF("");setCliF("");setMethF("");}} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
            <X className="w-3 h-3"/>Limpar</button>
        )}
        <div className="flex gap-2 ml-auto">
          <button onClick={()=>setModal("receita")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700">
            <Plus className="w-3 h-3"/>Receita</button>
          <button onClick={()=>setModal("despesa")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600">
            <Plus className="w-3 h-3"/>Despesa</button>
          <button onClick={()=>setModal("venda")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-3 h-3"/>Venda</button>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span>{filtered.length} lançamento{filtered.length!==1?"s":""}</span>
        {totE>0&&<span className="text-green-600 font-semibold">Entradas: {fmt(totE)}</span>}
        {totS>0&&<span className="text-red-500 font-semibold">Saídas: {fmt(totS)}</span>}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length===0 ? (
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
                  <th className="w-16"/>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx=>{
                  const isVirtual = tx.id.startsWith("inst_")||tx.id.startsWith("rev_");
                  return (
                    <tr key={tx.id} className="border-t border-gray-50 hover:bg-gray-50/50 group">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(txDate(tx))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tx.type==="receita"?"bg-green-100 text-green-700":"bg-red-100 text-red-600"}`}>
                          {tx.type==="receita"?"entrada":"saída"}</span>
                        {isVirtual&&<span className="ml-1 text-[9px] text-gray-300 font-medium">auto</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 truncate max-w-[150px]">{tx.description}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell">
                        {tx.client?<Link href={`/alunos?open=${tx.client.id}`} className="hover:text-indigo-600">{tx.client.name}</Link>:"—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell">{tx.category}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden xl:table-cell">{tx.paymentMethod||"—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={tx.status} type={tx.type} dueDate={tx.dueDate}
                          onClick={()=>onToggle(tx.id,tx.status==="pago"?"pendente":"pago")}/>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-sm">
                        <span style={{color:tx.type==="receita"?(tx.status==="pago"?"#16a34a":"#374151"):(tx.status==="pago"?"#dc2626":"#374151")}}>
                          {tx.type==="despesa"?"−":"+"}{fmt(tx.amount)}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={()=>setEditTx(tx)} className="p-1 rounded hover:bg-indigo-50 text-gray-300 hover:text-indigo-500">
                            <Pencil className="w-3.5 h-3.5"/></button>
                          {!isVirtual&&<button onClick={()=>onDelete(tx.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5"/></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal==="receita"&&<NovaReceitaModal clients={clients} incomeCats={incomeCats} recvMethods={recvMethods} onClose={()=>setModal(null)} onSave={tx=>{onAdd(tx);setModal(null);}}/>}
      {modal==="despesa"&&<NovaDespesaModal expenseCats={expenseCats} payMethods={payMethods} onClose={()=>setModal(null)} onSave={tx=>{onAdd(tx);setModal(null);}}/>}
      {modal==="venda"&&<NovaVendaModal clients={clients} recvMethods={recvMethods} onClose={()=>setModal(null)} onSave={sale=>{onAddSale(sale);setModal(null);}}/>}
      {editTx&&(
        <EditTxModal tx={editTx} clients={clients} incomeCats={incomeCats} expenseCats={expenseCats}
          recvMethods={recvMethods} payMethods={payMethods} onClose={()=>setEditTx(null)}
          onSave={async data=>{await handleEditSave(editTx,data);setEditTx(null);}}/>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const today = new Date();
  const [tab,setTab]             = useState<TabKey>("mes");
  const [monthDate,setMonthDate] = useState(new Date(today.getFullYear(),today.getMonth(),1));
  const [txs,setTxs]             = useState<Tx[]>([]);
  const [sales,setSales]         = useState<Sale[]>([]);
  const [clients,setClients]     = useState<Client[]>([]);
  const [configs,setConfigs]     = useState<FinConfig[]>([]);
  const [monthCloses,setMonthCloses] = useState<Record<string,MonthClose>>({});
  const [loading,setLoading]     = useState(true);
  const [showExtrato,setShowExtrato] = useState(false);

  // Derived categories/methods from config (fall back to defaults if empty)
  const incomeCats  = configs.filter(c=>c.type==="income_cat").map(c=>c.value).filter(Boolean).length
    ? configs.filter(c=>c.type==="income_cat").map(c=>c.value) : DEFAULT_INCOME_CATS;
  const expenseCats = configs.filter(c=>c.type==="expense_cat").map(c=>c.value).filter(Boolean).length
    ? configs.filter(c=>c.type==="expense_cat").map(c=>c.value) : DEFAULT_EXPENSE_CATS;
  const recvMethods = configs.filter(c=>c.type==="recv_method").map(c=>c.value).filter(Boolean).length
    ? configs.filter(c=>c.type==="recv_method").map(c=>c.value) : DEFAULT_RECV_METHODS;
  const payMethods  = configs.filter(c=>c.type==="pay_method").map(c=>c.value).filter(Boolean).length
    ? configs.filter(c=>c.type==="pay_method").map(c=>c.value) : DEFAULT_PAY_METHODS;
  const goals: Record<string,string> = Object.fromEntries(
    configs.filter(c=>c.type==="goal"&&c.key).map(c=>[c.key!,c.value])
  );

  async function loadData() {
    setLoading(true);
    async function j(r:Response) { try { return await r.json(); } catch { return null; } }
    const [txData,salesData,clientData,configData,closeData] = await Promise.all([
      fetch("/api/financeiro/lancamentos").then(j),
      fetch("/api/financeiro/vendas").then(j),
      fetch("/api/alunos").then(j),
      fetch("/api/financeiro/config").then(j),
      fetch("/api/financeiro/fechamento").then(j),
    ]);
    setTxs(Array.isArray(txData)?txData:[]);
    setSales(Array.isArray(salesData)?salesData:[]);
    setClients(Array.isArray(clientData)?clientData.map((c:Client)=>({id:c.id,name:c.name})):[]);
    setConfigs(Array.isArray(configData)?configData:[]);
    if (Array.isArray(closeData)) {
      const map: Record<string,MonthClose> = {};
      for (const mc of closeData) map[mc.month]=mc;
      setMonthCloses(map);
    }
    setLoading(false);
  }

  useEffect(()=>{ loadData(); },[]);

  // Virtual txs from installments
  const installmentIds = new Set(
    txs.filter(t=>(t as Tx&{installmentId?:string}).installmentId)
       .map(t=>(t as Tx&{installmentId?:string}).installmentId as string)
  );

  const installmentTxs: Tx[] = sales.flatMap(sale=>{
    const isCard = sale.negotiationType==="card";
    const txList: Tx[] = [];
    if (isCard&&sale.grossValue&&!installmentIds.has(`rev_${sale.id}`)) {
      txList.push({
        id:`rev_${sale.id}`,type:"receita",description:`${sale.description} (faturamento)`,
        amount:sale.grossValue,category:"Faturamento",status:"pago",
        dueDate:sale.createdAt??null,paidAt:sale.createdAt??null,
        paymentMethod:sale.paymentMethod??null,notes:null,client:sale.client,_saleId:sale.id,
      });
    }
    return [...txList, ...sale.installments.filter(inst=>!installmentIds.has(inst.id)).map(inst=>{
      const cashAmt = (isCard&&(inst as Installment&{netValue?:number|null}).netValue)
        ? (inst as Installment&{netValue?:number|null}).netValue as number : inst.amount;
      const label = (inst as Installment&{label?:string|null}).label;
      const suffix = label?` — ${label}`:sale.installmentsCount>1?` (${inst.number}/${sale.installmentsCount})`:"";
      return {
        id:`inst_${inst.id}`,type:"receita" as const,
        description:isCard?`${sale.description}${suffix} (caixa)`:`${sale.description}${suffix}`,
        amount:cashAmt,
        category:isCard?"Caixa":sale.installmentsCount===1?"Consultoria anual":"Parcela",
        status:inst.status,dueDate:inst.dueDate??null,paidAt:inst.paidAt??null,
        paymentMethod:sale.paymentMethod??null,notes:null,client:sale.client,
        _saleId:sale.id,_installmentId:inst.id,
      };
    })];
  });

  const allTxs: Tx[] = [...txs,...installmentTxs];

  // Handlers
  function addTx(tx:Tx) { setTxs(p=>[...p,tx]); }
  function addSale(sale:Sale) { setSales(p=>[sale,...p]); }

  function updateTx(id:string, data:Partial<Tx>) {
    setTxs(p=>p.map(t=>t.id===id?{...t,...data}:t));
  }

  function updateInstallment(saleId:string, instId:string, data:Partial<Installment>) {
    setSales(p=>p.map(s=>s.id===saleId
      ?{...s,installments:s.installments.map(i=>i.id===instId?{...i,...data}:i)}
      :s));
  }

  async function toggleTx(id:string,status:string) {
    if (id.startsWith("inst_")) {
      const instId=id.replace("inst_","");
      const sale=sales.find(s=>s.installments.some(i=>i.id===instId));
      if (!sale) return;
      const paidAt=status==="pago"?new Date().toISOString():null;
      await fetch(`/api/financeiro/vendas/${sale.id}/parcelas/${instId}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status}),
      });
      setSales(p=>p.map(s=>s.id===sale.id?{...s,installments:s.installments.map(i=>i.id===instId?{...i,status,paidAt}:i)}:s));
      return;
    }
    const res=await fetch(`/api/financeiro/lancamentos/${id}`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status}),
    });
    const updated=await res.json();
    setTxs(p=>p.map(t=>t.id===id?{...t,...updated}:t));
  }

  async function deleteTx(id:string) {
    if (id.startsWith("inst_")) { alert("Para remover parcelas de aluno, exclua a venda na ficha do aluno."); return; }
    if (!confirm("Remover este lançamento?")) return;
    const res=await fetch(`/api/financeiro/lancamentos/${id}`,{method:"DELETE"});
    if (!res.ok) { const d=await res.json().catch(()=>({})); alert(d.error||"Não foi possível remover."); return; }
    setTxs(p=>p.filter(t=>t.id!==id));
  }

  const saveMonthClose = useCallback(async (month:string, data:Partial<MonthClose>) => {
    const res = await fetch("/api/financeiro/fechamento",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({month,...data}),
    });
    if (res.ok) {
      const updated = await res.json();
      setMonthCloses(p=>({...p,[month]:updated}));
    }
  },[]);

  const saveMonthCloseForDate = useCallback(async (data:Partial<MonthClose>) => {
    await saveMonthClose(monthStr(monthDate),data);
  },[saveMonthClose,monthDate]);

  async function saveGoal(key:string,value:string) {
    const res=await fetch("/api/financeiro/config",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type:"goal",key,value}),
    });
    if (res.ok) {
      const updated=await res.json();
      setConfigs(p=>{
        const existing=p.findIndex(c=>c.type==="goal"&&c.key===key);
        if (existing>=0) return p.map((c,i)=>i===existing?updated:c);
        return [...p,updated];
      });
    }
  }

  async function addConfig(type:string,value:string) {
    const res=await fetch("/api/financeiro/config",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type,value,order:configs.filter(c=>c.type===type).length}),
    });
    if (res.ok) { const created=await res.json(); setConfigs(p=>[...p,created]); }
  }

  async function deleteConfig(id:string) {
    await fetch(`/api/financeiro/config/${id}`,{method:"DELETE"});
    setConfigs(p=>p.filter(c=>c.id!==id));
  }

  const curMonthClose = monthCloses[monthStr(monthDate)] ?? null;
  const monthLabel = `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  const TABS: {key:TabKey;label:string;icon:React.ReactNode}[] = [
    {key:"painel",      label:"Painel",            icon:<LayoutGrid className="w-4 h-4"/>},
    {key:"mes",         label:"Mês Atual",         icon:<Calendar className="w-4 h-4"/>},
    {key:"planejamento",label:"Planejamento Anual", icon:<BarChart3 className="w-4 h-4"/>},
    {key:"config",      label:"Configurações",     icon:<Settings className="w-4 h-4"/>},
    {key:"lancamentos", label:"Lançamentos",       icon:<FileText className="w-4 h-4"/>},
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 shadow-sm px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
            <p className="text-gray-400 text-sm mt-0.5">Gestão de caixa, recebimentos e pagamentos</p>
          </div>
          <div className="flex items-center gap-2">
            {tab==="mes"&&(
              <div className="flex items-center gap-1 border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={()=>setMonthDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))} className="p-2 hover:bg-gray-50"><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
                <span className="px-3 text-sm font-semibold text-gray-700 min-w-[140px] text-center">{monthLabel}</span>
                <button onClick={()=>setMonthDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))} className="p-2 hover:bg-gray-50"><ChevronRight className="w-4 h-4 text-gray-500"/></button>
              </div>
            )}
            <button onClick={()=>loadData()} disabled={loading}
              className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading?"animate-spin":""}`}/></button>
            <button onClick={()=>setShowExtrato(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
              <Upload className="w-4 h-4"/>Importar Extrato IA</button>
          </div>
        </div>
        <div className="flex gap-0 -mb-px">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab===t.key?"border-indigo-500 text-indigo-600":"border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-32 gap-2 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400"/>Carregando...
          </div>
        ) : (
          <>
            {tab==="painel"&&(
              <PainelTab allTxs={allTxs} goals={goals} onSaveGoal={saveGoal}/>
            )}
            {tab==="mes"&&(
              <MesAtualTab
                allTxs={allTxs} txs={txs} monthDate={monthDate} clients={clients}
                incomeCats={incomeCats} expenseCats={expenseCats} recvMethods={recvMethods} payMethods={payMethods}
                monthClose={curMonthClose} onSaveClose={saveMonthCloseForDate}
                onToggle={toggleTx} onDelete={deleteTx} onAdd={addTx} onAddSale={addSale}
                onEditTx={()=>{}} onUpdateTx={updateTx} onUpdateInstallment={updateInstallment}
              />
            )}
            {tab==="planejamento"&&(
              <PlanejamentoTab allTxs={allTxs} txs={txs} monthCloses={monthCloses} onSaveClose={saveMonthClose}/>
            )}
            {tab==="config"&&(
              <ConfiguracoesTab configs={configs} onAdd={addConfig} onDelete={deleteConfig}/>
            )}
            {tab==="lancamentos"&&(
              <LancamentosTab
                allTxs={allTxs} txs={txs} clients={clients}
                incomeCats={incomeCats} expenseCats={expenseCats} recvMethods={recvMethods} payMethods={payMethods}
                onToggle={toggleTx} onDelete={deleteTx} onAdd={addTx} onAddSale={addSale}
                onUpdateTx={updateTx} onUpdateInstallment={updateInstallment}
              />
            )}
          </>
        )}
      </div>

      {showExtrato&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Importar Extrato com IA</h2>
                <p className="text-sm text-gray-400 mt-0.5">Upload do extrato — a IA classifica automaticamente</p>
              </div>
              <button onClick={()=>setShowExtrato(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <ExtratoContent onClose={()=>setShowExtrato(false)} onImport={list=>{setTxs(p=>[...p,...list]);}}/>
          </div>
        </div>
      )}
    </div>
  );
}

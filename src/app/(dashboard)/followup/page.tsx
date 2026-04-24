"use client";

import { useState } from "react";
import { Plus, Mail, MessageCircle, Zap, Play, Pause, CheckCircle, XCircle, Clock } from "lucide-react";

type Step = { id: string; channel: "email" | "whatsapp"; delayDays: number; subject?: string; template: string };
type Sequence = { id: string; name: string; trigger: string; active: boolean; steps: Step[] };
type Log = { id: string; client: string; channel: string; status: string; sentAt: string; seqName: string };

const triggers: Record<string, string> = {
  novo_lead: "Novo Lead",
  proposta: "Proposta Enviada",
  reuniao: "Reunião Agendada",
  contrato_vencendo: "Contrato Vencendo",
};

export default function FollowUpPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [logs] = useState<Log[]>([]);
  const [tab, setTab] = useState<"sequencias" | "logs">("sequencias");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", trigger: "novo_lead" });
  const [showStep, setShowStep] = useState(false);
  const [stepForm, setStepForm] = useState({ channel: "email" as "email" | "whatsapp", delayDays: 3, subject: "", template: "" });

  const currentSeq = sequences.find((s) => s.id === selected);

  const addSeq = () => {
    if (!form.name) return;
    const s: Sequence = { id: crypto.randomUUID(), name: form.name, trigger: form.trigger, active: true, steps: [] };
    setSequences((prev) => [...prev, s]);
    setSelected(s.id);
    setShowForm(false);
    setForm({ name: "", trigger: "novo_lead" });
  };

  const addStep = () => {
    if (!stepForm.template || !selected) return;
    const step: Step = { id: crypto.randomUUID(), ...stepForm };
    setSequences((prev) => prev.map((s) => s.id === selected ? { ...s, steps: [...s.steps, step] } : s));
    setShowStep(false);
    setStepForm({ channel: "email", delayDays: 3, subject: "", template: "" });
  };

  const toggleActive = (id: string) => {
    setSequences((prev) => prev.map((s) => s.id === id ? { ...s, active: !s.active } : s));
  };

  const logStatusIcon = (status: string) => {
    if (status === "enviado") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    if (status === "falhou") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <Clock className="w-3.5 h-3.5 text-amber-500" />;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-up Automatizado</h1>
          <p className="text-gray-500 text-sm mt-1">Sequências de e-mail e WhatsApp</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#6366f1" }}>
          <Plus className="w-4 h-4" />
          Nova Sequência
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {(["sequencias", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? "text-white" : "text-gray-500 hover:bg-gray-100"}`}
            style={tab === t ? { background: "#6366f1" } : {}}
          >
            {t === "sequencias" ? "Sequências" : "Histórico de Envios"}
          </button>
        ))}
      </div>

      {tab === "sequencias" && (
        <div className="flex gap-5">
          {/* Lista */}
          <div className="w-64 flex-shrink-0 space-y-2">
            {sequences.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">
                <Zap className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                Nenhuma sequência criada
              </div>
            )}
            {sequences.map((seq) => (
              <button
                key={seq.id}
                onClick={() => setSelected(seq.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${selected === seq.id ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-sm font-medium truncate ${selected === seq.id ? "text-indigo-700" : "text-gray-800"}`}>{seq.name}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleActive(seq.id); }}
                    className={`flex-shrink-0 ml-1 p-1 rounded-full ${seq.active ? "text-green-500 hover:bg-green-50" : "text-gray-300 hover:bg-gray-100"}`}
                  >
                    {seq.active ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400">{triggers[seq.trigger]}</p>
                <p className="text-xs text-gray-400">{seq.steps.length} passo(s)</p>
              </button>
            ))}
          </div>

          {/* Detalhe */}
          <div className="flex-1">
            {!currentSeq ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                Selecione uma sequência
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-gray-800">{currentSeq.name}</h2>
                    <p className="text-xs text-gray-400">Gatilho: {triggers[currentSeq.trigger]}</p>
                  </div>
                  <button onClick={() => setShowStep(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">
                    <Plus className="w-3.5 h-3.5" />
                    Passo
                  </button>
                </div>

                {currentSeq.steps.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Adicione passos à sequência</p>
                ) : (
                  <div className="space-y-3">
                    {currentSeq.steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "#6366f1" }}>
                            {i + 1}
                          </div>
                          {i < currentSeq.steps.length - 1 && <div className="w-0.5 h-6 bg-gray-200 my-1" />}
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            {step.channel === "email" ? <Mail className="w-3.5 h-3.5 text-indigo-500" /> : <MessageCircle className="w-3.5 h-3.5 text-green-500" />}
                            <span className="text-xs font-medium text-gray-700 capitalize">{step.channel}</span>
                            <span className="text-xs text-gray-400">• após {step.delayDays} dia(s)</span>
                          </div>
                          {step.subject && <p className="text-xs font-medium text-gray-600 mb-1">Assunto: {step.subject}</p>}
                          <p className="text-xs text-gray-500 line-clamp-2">{step.template}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Sequência</th>
                <th className="px-5 py-3 font-medium">Canal</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Enviado em</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">Nenhum envio registrado</td></tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{log.client}</td>
                  <td className="px-5 py-3 text-gray-500">{log.seqName}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {log.channel === "email" ? <Mail className="w-3.5 h-3.5 text-indigo-500" /> : <MessageCircle className="w-3.5 h-3.5 text-green-500" />}
                      <span className="capitalize text-gray-600">{log.channel}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {logStatusIcon(log.status)}
                      <span className="capitalize text-gray-600">{log.status}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{log.sentAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Sequência */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nova Sequência</h2>
            <div className="space-y-3">
              <input placeholder="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              <select value={form.trigger} onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-indigo-400">
                {Object.entries(triggers).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100">Cancelar</button>
              <button onClick={addSeq} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: "#6366f1" }}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Passo */}
      {showStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Novo Passo</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["email", "whatsapp"] as const).map((c) => (
                  <button key={c} onClick={() => setStepForm((f) => ({ ...f, channel: c }))} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${stepForm.channel === c ? "text-white" : "bg-gray-100 text-gray-600"}`} style={stepForm.channel === c ? { background: "#6366f1" } : {}}>
                    {c === "email" ? <Mail className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
                    {c === "email" ? "E-mail" : "WhatsApp"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">Após</label>
                <input type="number" min={1} value={stepForm.delayDays} onChange={(e) => setStepForm((f) => ({ ...f, delayDays: Number(e.target.value) }))} className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                <label className="text-sm text-gray-600">dia(s)</label>
              </div>
              {stepForm.channel === "email" && (
                <input placeholder="Assunto do e-mail" value={stepForm.subject} onChange={(e) => setStepForm((f) => ({ ...f, subject: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              )}
              <textarea
                placeholder="Template da mensagem * (use {nome}, {empresa})"
                value={stepForm.template}
                onChange={(e) => setStepForm((f) => ({ ...f, template: e.target.value }))}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowStep(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100">Cancelar</button>
              <button onClick={addStep} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: "#6366f1" }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

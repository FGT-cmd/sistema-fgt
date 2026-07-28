"use client";

import {
  RECEIVABLE_METHODS, defaultCashDate, emptyLine, sumTotals, netValueOf,
  type ReceivableLine,
} from "@/lib/financeiro/receivables";

const cell = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function ReceivablesTable({ lines, onChange, startDate }: {
  lines: ReceivableLine[];
  onChange: (lines: ReceivableLine[]) => void;
  startDate: string;
}) {
  // Alterar valor/forma de pagamento recalcula a data de caixa,
  // a menos que o usuário já tenha ajustado a data manualmente.
  function update(idx: number, patch: Partial<ReceivableLine>) {
    onChange(lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      if (patch.paymentMethod !== undefined || patch.dueDate !== undefined) {
        const eraAutomatica = l.cashDate === defaultCashDate(l.dueDate, l.paymentMethod);
        if (eraAutomatica) next.cashDate = defaultCashDate(next.dueDate, next.paymentMethod);
      }
      return next;
    }));
  }

  function addLine() { onChange([...lines, emptyLine(startDate)]); }
  function removeLine(idx: number) { onChange(lines.filter((_, i) => i !== idx)); }

  const totals = sumTotals(lines);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((l, idx) => (
          <div key={l.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/60">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-gray-500">
                Valor
                <input type="text" inputMode="decimal" value={l.amount} placeholder="0,00"
                  onChange={e => update(idx, { amount: e.target.value })}
                  className={`${cell} w-full mt-0.5`} />
              </label>
              <label className="text-[11px] text-gray-500">
                Forma de pagamento
                <select value={l.paymentMethod}
                  onChange={e => update(idx, { paymentMethod: e.target.value })}
                  className={`${cell} w-full mt-0.5`}>
                  {RECEIVABLE_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-gray-500">
                Vencimento
                <input type="date" value={l.dueDate}
                  onChange={e => update(idx, { dueDate: e.target.value })}
                  className={`${cell} w-full mt-0.5`} />
              </label>
              <label className="text-[11px] text-gray-500">
                Entra no caixa
                <input type="date" value={l.cashDate}
                  onChange={e => update(idx, { cashDate: e.target.value })}
                  className={`${cell} w-full mt-0.5`} />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input type="text" value={l.label} placeholder="Rótulo (ex: Entrada)"
                onChange={e => update(idx, { label: e.target.value })}
                className={`${cell} flex-1 min-w-[120px]`} />

              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button type="button" onClick={() => update(idx, { feeOwner: "aluno" })}
                  className={`px-2 py-1.5 text-xs ${l.feeOwner === "aluno" ? "bg-indigo-500 text-white" : "bg-white text-gray-600"}`}>
                  Taxa do aluno
                </button>
                <button type="button" onClick={() => update(idx, { feeOwner: "empresa" })}
                  className={`px-2 py-1.5 text-xs ${l.feeOwner === "empresa" ? "bg-indigo-500 text-white" : "bg-white text-gray-600"}`}>
                  Taxa minha
                </button>
              </div>

              {l.feeOwner === "empresa" && (
                <input type="text" inputMode="decimal" value={l.feeValue} placeholder="Taxa R$"
                  onChange={e => update(idx, { feeValue: e.target.value })}
                  className={`${cell} w-24`} />
              )}

              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={l.paid}
                  onChange={e => update(idx, { paid: e.target.checked })} />
                Pago
              </label>

              <button type="button" onClick={() => removeLine(idx)}
                className="ml-auto text-xs text-red-500 hover:underline">
                Remover
              </button>
            </div>

            {l.feeOwner === "empresa" && (
              <p className="text-[11px] text-gray-500">Líquido: {fmt(netValueOf(l))}</p>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addLine}
        className="text-sm text-indigo-600 hover:underline">
        + Adicionar recebimento
      </button>

      <div className="flex gap-4 text-sm border-t border-gray-200 pt-2">
        <span className="text-gray-500">Faturamento: <strong className="text-gray-800">{fmt(totals.faturamento)}</strong></span>
        <span className="text-gray-500">Caixa: <strong className="text-gray-800">{fmt(totals.caixa)}</strong></span>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatAmountBrl } from "@/lib/checkout-session";

type Props = {
  token: string;
  initialCompleted: boolean;
};

export function CheckoutClient({ token, initialCompleted }: Props) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCpf: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/public/checkout/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Não foi possível enviar. Verifique os dados.");
        return;
      }
      setCompleted(true);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-900">
        <p className="text-lg font-medium">Obrigado!</p>
        <p className="mt-2 text-sm">
          Seus dados foram registrados. Em breve você receberá as instruções de pagamento.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div>
        <label htmlFor="customerName" className="mb-1 block text-sm font-medium text-slate-700">
          Nome completo
        </label>
        <input
          id="customerName"
          name="customerName"
          required
          autoComplete="name"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={form.customerName}
          onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="customerCpf" className="mb-1 block text-sm font-medium text-slate-700">
          CPF
        </label>
        <input
          id="customerCpf"
          name="customerCpf"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={form.customerCpf}
          onChange={(e) => setForm((f) => ({ ...f, customerCpf: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="customerEmail" className="mb-1 block text-sm font-medium text-slate-700">
          E-mail
        </label>
        <input
          id="customerEmail"
          name="customerEmail"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={form.customerEmail}
          onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="customerPhone" className="mb-1 block text-sm font-medium text-slate-700">
          Telefone (com DDD)
        </label>
        <input
          id="customerPhone"
          name="customerPhone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={form.customerPhone}
          onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "Enviando…" : "Continuar"}
      </button>
    </form>
  );
}

export function CheckoutSummary({ productName, amountCents }: { productName: string; amountCents: number }) {
  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resumo</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{productName}</p>
      <p className="mt-2 text-2xl font-bold text-blue-700">{formatAmountBrl(amountCents)}</p>
    </div>
  );
}

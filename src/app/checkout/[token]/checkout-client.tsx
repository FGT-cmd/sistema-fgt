"use client";

import { useState } from "react";
import { formatAmountBrl } from "@/lib/checkout-session";

export type CheckoutPageMode = "pending" | "has_pay_link" | "retry_pay";

type Props = {
  token: string;
  mode: CheckoutPageMode;
  initialCheckoutUrl: string | null;
};

export function CheckoutClient({ token, mode, initialCheckoutUrl }: Props) {
  const checkoutUrl = initialCheckoutUrl;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCpf: "",
  });

  async function postSubmit(body: Record<string, string>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/public/checkout/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; checkoutUrl?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Não foi possível continuar. Tente novamente.");
        return;
      }
      if (typeof data.checkoutUrl === "string" && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setError("Resposta sem URL de pagamento. Contate o suporte.");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await postSubmit(form);
  }

  async function onRetryPayment() {
    await postSubmit({});
  }

  if (checkoutUrl) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-900">
        <p className="text-lg font-medium">Pagamento</p>
        <p className="mt-2 text-sm">Continue no InfinitePay para concluir o pagamento.</p>
        <a
          href={checkoutUrl}
          className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Abrir pagamento
        </a>
      </div>
    );
  }

  if (mode === "retry_pay") {
    return (
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <p className="text-sm text-slate-600">
          Não foi possível abrir o pagamento na última tentativa. Você pode tentar novamente.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={onRetryPayment}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Conectando…" : "Tentar abrir pagamento novamente"}
        </button>
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
        {loading ? "Enviando…" : "Continuar para pagamento"}
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

"use client";

import { useState } from "react";
import { formatAmountBrl } from "@/lib/checkout-session";

export type CheckoutPageMode = "pending" | "has_pay_link" | "retry_pay" | "paid";

type Props = {
  token: string;
  mode: CheckoutPageMode;
  initialCheckoutUrl: string | null;
};

const CREAM = "#ffffff";
const GOLD = "#E91E90"; // nome mantido por simplicidade, agora é a cor rosa do sistema Mapa de Trocas
const PINK_DARK = "#C41675";

const inputStyle: React.CSSProperties = {
  background: "#0d0d0d",
  border: "1px solid rgba(255,255,255,0.15)",
  color: CREAM,
};

const labelClass = "mb-1 block text-sm font-medium";

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

  if (mode === "paid") {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: "rgba(233,30,144,0.1)", border: "1px solid rgba(233,30,144,0.35)" }}
      >
        <p className="text-lg font-medium" style={{ color: CREAM }}>Pagamento confirmado</p>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          Obrigado! Seu cadastro foi concluído com sucesso.
        </p>
      </div>
    );
  }

  if (checkoutUrl) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: "rgba(233,30,144,0.1)", border: "1px solid rgba(233,30,144,0.35)" }}
      >
        <p className="text-lg font-medium" style={{ color: CREAM }}>Pagamento</p>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          Continue no InfinitePay para concluir o pagamento.
        </p>
        <a
          href={checkoutUrl}
          className="mt-5 inline-block rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: GOLD, color: "#1a1a1a" }}
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
          <div
            className="rounded-xl px-3 py-2 text-sm"
            style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", color: "#fca5a5" }}
          >
            {error}
          </div>
        ) : null}
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          Não foi possível abrir o pagamento na última tentativa. Você pode tentar novamente.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={onRetryPayment}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: GOLD, color: "#1a1a1a" }}
        >
          {loading ? "Conectando…" : "Tentar abrir pagamento novamente"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", color: "#fca5a5" }}
        >
          {error}
        </div>
      ) : null}

      <div>
        <label htmlFor="customerName" className={labelClass} style={{ color: "rgba(255,255,255,0.85)" }}>
          Nome completo
        </label>
        <input
          id="customerName"
          name="customerName"
          required
          autoComplete="name"
          className="w-full rounded-xl px-3 py-2.5 outline-none focus:ring-1"
          style={{ ...inputStyle, outlineColor: GOLD }}
          value={form.customerName}
          onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="customerCpf" className={labelClass} style={{ color: "rgba(255,255,255,0.85)" }}>
          CPF
        </label>
        <input
          id="customerCpf"
          name="customerCpf"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          className="w-full rounded-xl px-3 py-2.5 outline-none focus:ring-1"
          style={inputStyle}
          value={form.customerCpf}
          onChange={(e) => setForm((f) => ({ ...f, customerCpf: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="customerEmail" className={labelClass} style={{ color: "rgba(255,255,255,0.85)" }}>
          E-mail
        </label>
        <input
          id="customerEmail"
          name="customerEmail"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-xl px-3 py-2.5 outline-none focus:ring-1"
          style={inputStyle}
          value={form.customerEmail}
          onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="customerPhone" className={labelClass} style={{ color: "rgba(255,255,255,0.85)" }}>
          Telefone (com DDD)
        </label>
        <input
          id="customerPhone"
          name="customerPhone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          className="w-full rounded-xl px-3 py-2.5 outline-none focus:ring-1"
          style={inputStyle}
          value={form.customerPhone}
          onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: GOLD, color: "#1a1a1a" }}
      >
        {loading ? "Enviando…" : "Continuar para pagamento"}
      </button>
    </form>
  );
}

export function CheckoutSummary({ productName, amountCents }: { productName: string; amountCents: number }) {
  return (
    <div
      className="mb-6 rounded-2xl p-5"
      style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
        Resumo
      </p>
      <p className="mt-1 text-lg font-semibold" style={{ color: CREAM }}>{productName}</p>
      <p className="mt-2 text-2xl font-bold" style={{ color: GOLD }}>{formatAmountBrl(amountCents)}</p>
    </div>
  );
}

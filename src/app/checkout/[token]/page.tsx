import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CheckoutClient, CheckoutSummary, type CheckoutPageMode } from "./checkout-client";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const session = await prisma.checkoutSession.findUnique({
    where: { token: token.trim() },
    select: { productName: true },
  });
  if (!session) return { title: "Checkout | Sistema FGT" };
  return { title: `${session.productName} | Checkout FGT` };
}

export default async function CheckoutTokenPage({ params }: PageProps) {
  const { token: raw } = await params;
  const token = raw?.trim();
  if (!token) notFound();

  const session = await prisma.checkoutSession.findUnique({ where: { token } });
  if (!session) notFound();

  const payUrl = session.infinitepayCheckoutUrl ?? null;
  let mode: CheckoutPageMode = "pending";
  if (session.status === "paid") mode = "paid";
  else if (payUrl) mode = "has_pay_link";
  else if (session.status === "customer_data_completed") mode = "retry_pay";

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <p className="text-sm font-medium text-slate-500">Sistema FGT</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Checkout</h1>
        </header>

        <CheckoutSummary productName={session.productName} amountCents={session.amountCents} />

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {mode === "pending" ? (
            <p className="mb-4 text-sm text-slate-600">
              Preencha seus dados para ser redirecionado ao pagamento seguro (InfinitePay).
            </p>
          ) : null}
          {mode === "paid" ? (
            <p className="mb-4 text-sm text-slate-600">Este pagamento já foi confirmado.</p>
          ) : null}
          <CheckoutClient token={token} mode={mode} initialCheckoutUrl={payUrl} />
        </div>
      </div>
    </div>
  );
}

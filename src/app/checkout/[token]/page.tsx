import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
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
    <div
      className="min-h-screen px-4 py-12"
      style={{
        background: "linear-gradient(to bottom, #1a0a12 0%, #000 10%, #000 90%, #1a0a12 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-md">
        <header className="mb-10 flex flex-col items-center text-center">
          <Image
            src="/logo-fgsquad.jpeg"
            alt="FG Squad"
            width={280}
            height={80}
            className="mb-6 h-auto w-[260px]"
            priority
          />
          <h1
            className="text-3xl font-semibold"
            style={{ color: "#fff" }}
          >
            Checkout
          </h1>
        </header>

        <CheckoutSummary productName={session.productName} amountCents={session.amountCents} />

        <div
          className="rounded-2xl p-6"
          style={{ background: "#1a1a1a", border: "1px solid rgba(233,30,144,0.2)" }}
        >
          {mode === "pending" ? (
            <p className="mb-4 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              Preencha seus dados para ser redirecionado ao pagamento seguro (InfinitePay).
            </p>
          ) : null}
          {mode === "paid" ? (
            <p className="mb-4 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              Este pagamento já foi confirmado.
            </p>
          ) : null}
          <CheckoutClient token={token} mode={mode} initialCheckoutUrl={payUrl} />
        </div>

        <p className="mt-8 text-center text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          Pagamento processado com segurança via InfinitePay.
        </p>
      </div>
    </div>
  );
}

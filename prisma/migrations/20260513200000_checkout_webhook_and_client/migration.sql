-- AlterTable Client
ALTER TABLE "Client" ADD COLUMN "cpf" TEXT;

-- AlterTable CheckoutSession
ALTER TABLE "CheckoutSession" ADD COLUMN "clientId" TEXT,
ADD COLUMN "infinitepayTransactionNsu" TEXT,
ADD COLUMN "infinitepayReceiptUrl" TEXT,
ADD COLUMN "infinitepayCaptureMethod" TEXT,
ADD COLUMN "paidAmountCents" INTEGER,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "webhookPayload" JSONB;

CREATE UNIQUE INDEX "CheckoutSession_clientId_key" ON "CheckoutSession"("clientId");

ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CheckoutSession_infinitepayOrderNsu_idx" ON "CheckoutSession"("infinitepayOrderNsu");

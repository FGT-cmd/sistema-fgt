-- AlterTable
ALTER TABLE "CheckoutSession" ADD COLUMN     "infinitepayOrderNsu" TEXT,
ADD COLUMN     "infinitepayCheckoutUrl" TEXT,
ADD COLUMN     "infinitepaySlug" TEXT,
ADD COLUMN     "infinitepayRawResponse" JSONB;

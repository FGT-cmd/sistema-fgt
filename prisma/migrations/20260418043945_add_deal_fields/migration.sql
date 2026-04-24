-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "firstContact" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "funnel" TEXT,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "source" TEXT;

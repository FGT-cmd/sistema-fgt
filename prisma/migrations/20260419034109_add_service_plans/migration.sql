-- CreateTable
CREATE TABLE "ServicePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "durationMonths" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ServicePlan" ADD CONSTRAINT "ServicePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MonthlyGoal" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "revenueGoal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newClientsGoal" INTEGER NOT NULL DEFAULT 0,
    "leadsGoal" INTEGER NOT NULL DEFAULT 0,
    "conversionGoal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "goalId" TEXT NOT NULL,

    CONSTRAINT "GoalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyGoal_userId_month_year_key" ON "MonthlyGoal"("userId", "month", "year");

-- AddForeignKey
ALTER TABLE "MonthlyGoal" ADD CONSTRAINT "MonthlyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalItem" ADD CONSTRAINT "GoalItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "MonthlyGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

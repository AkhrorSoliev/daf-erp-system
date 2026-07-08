-- CreateTable
CREATE TABLE "DailyFinancialSnapshot" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "totalDebt" INTEGER NOT NULL DEFAULT 0,
    "debtorCount" INTEGER NOT NULL DEFAULT 0,
    "activeStudents" INTEGER NOT NULL DEFAULT 0,
    "mtdIncome" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyFinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyFinancialSnapshot_companyId_date_idx" ON "DailyFinancialSnapshot"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFinancialSnapshot_companyId_date_key" ON "DailyFinancialSnapshot"("companyId", "date");

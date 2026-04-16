-- DropIndex
DROP INDEX "Expense_settledBySalaryPaymentId_idx";

-- CreateTable
CREATE TABLE "PaymeTransaction" (
    "id" TEXT NOT NULL,
    "paymeId" TEXT NOT NULL,
    "paymeTime" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL,
    "amountInSom" INTEGER NOT NULL,
    "state" INTEGER NOT NULL DEFAULT 1,
    "reason" INTEGER,
    "studentId" INTEGER NOT NULL,
    "createTime" BIGINT NOT NULL,
    "performTime" BIGINT,
    "cancelTime" BIGINT,
    "paymentId" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymeTransaction_paymentId_key" ON "PaymeTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PaymeTransaction_companyId_createTime_idx" ON "PaymeTransaction"("companyId", "createTime");

-- CreateIndex
CREATE INDEX "PaymeTransaction_studentId_idx" ON "PaymeTransaction"("studentId");

-- CreateIndex
CREATE INDEX "PaymeTransaction_state_idx" ON "PaymeTransaction"("state");

-- CreateIndex
CREATE UNIQUE INDEX "PaymeTransaction_paymeId_companyId_key" ON "PaymeTransaction"("paymeId", "companyId");

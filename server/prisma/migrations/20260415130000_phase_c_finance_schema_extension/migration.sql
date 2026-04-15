-- Phase C.1: Finance schema extension.
-- Adds contract-level transaction tracking, salary coverage link,
-- payment idempotency, payment source, expense-employee link,
-- per-company tax config, and gateway event log.

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('ADMIN_MANUAL', 'STUDENT_PORTAL', 'GATEWAY_WEBHOOK', 'MANUAL_ATTACH');

-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE 'TEACHER_ADVANCE';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'ADMIN_MANUAL';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "contractId" TEXT,
ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "reversedTransactionId" TEXT;

-- AlterTable
ALTER TABLE "SalaryAccrual" ADD COLUMN     "deductionTransactionId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "relatedUserId" INTEGER;

-- CreateTable
CREATE TABLE "CompanyTaxConfig" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "salaryTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 12.0,
    "refundTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentGatewayEvent" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "provider" "PaymentMethod" NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentGatewayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTaxConfig_companyId_key" ON "CompanyTaxConfig"("companyId");

-- CreateIndex
CREATE INDEX "PaymentGatewayEvent_companyId_provider_createdAt_idx" ON "PaymentGatewayEvent"("companyId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentGatewayEvent_externalId_idx" ON "PaymentGatewayEvent"("externalId");

-- CreateIndex
CREATE INDEX "PaymentGatewayEvent_processed_idx" ON "PaymentGatewayEvent"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_method_externalId_companyId_key" ON "Payment"("method", "externalId", "companyId");

-- CreateIndex
CREATE INDEX "Transaction_contractId_idx" ON "Transaction"("contractId");

-- CreateIndex
CREATE INDEX "Transaction_expenseId_idx" ON "Transaction"("expenseId");

-- CreateIndex
CREATE INDEX "Transaction_reversedTransactionId_idx" ON "Transaction"("reversedTransactionId");

-- CreateIndex
CREATE INDEX "SalaryAccrual_deductionTransactionId_idx" ON "SalaryAccrual"("deductionTransactionId");

-- CreateIndex
CREATE INDEX "Expense_relatedUserId_idx" ON "Expense"("relatedUserId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversedTransactionId_fkey" FOREIGN KEY ("reversedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAccrual" ADD CONSTRAINT "SalaryAccrual_deductionTransactionId_fkey" FOREIGN KEY ("deductionTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

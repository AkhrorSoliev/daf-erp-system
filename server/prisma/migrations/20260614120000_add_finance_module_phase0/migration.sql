-- Finance Module — Phase 0 (purely additive)
-- Revenue classification, real cash-account ledger, discounts, scholarships,
-- installment plans, and alerts. No existing data is modified or dropped.

-- CreateEnum
CREATE TYPE "RevenueType" AS ENUM ('TUITION', 'REGISTRATION_FEE', 'CERTIFICATE_FEE', 'MATERIAL_SALE', 'MOCK_EXAM_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "CashAccountType" AS ENUM ('CASH', 'BANK', 'CARD');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('INFLOW', 'OUTFLOW', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "ScholarshipType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('OVERDUE_PAYMENT', 'LOW_CASH_BALANCE', 'UPCOMING_SALARY', 'LARGE_EXPENSE', 'ANOMALY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterEnum (new expense categories)
ALTER TYPE "ExpenseCategory" ADD VALUE 'EQUIPMENT';
ALTER TYPE "ExpenseCategory" ADD VALUE 'MAINTENANCE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'TAXES';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "revenueType" "RevenueType" DEFAULT 'TUITION';

-- CreateTable
CREATE TABLE "CashAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashAccountType" NOT NULL DEFAULT 'CASH',
    "branchId" INTEGER,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "transactionId" TEXT,
    "description" TEXT,
    "reversedTransactionId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "performedById" INTEGER,
    "branchId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "scope" JSONB,
    "reason" TEXT,
    "createdById" INTEGER NOT NULL,
    "branchId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scholarship" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "type" "ScholarshipType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "reason" TEXT,
    "approvedById" INTEGER,
    "createdById" INTEGER NOT NULL,
    "branchId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Scholarship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequenceNum" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER,
    "paidAt" TIMESTAMP(3),
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "windowDays" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" INTEGER,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashAccount_companyId_idx" ON "CashAccount"("companyId");

-- CreateIndex
CREATE INDEX "CashAccount_branchId_idx" ON "CashAccount"("branchId");

-- CreateIndex
CREATE INDEX "CashAccount_deletedAt_idx" ON "CashAccount"("deletedAt");

-- CreateIndex
CREATE INDEX "CashMovement_cashAccountId_createdAt_idx" ON "CashMovement"("cashAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_companyId_createdAt_idx" ON "CashMovement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_type_idx" ON "CashMovement"("type");

-- CreateIndex
CREATE INDEX "CashMovement_reversedTransactionId_idx" ON "CashMovement"("reversedTransactionId");

-- CreateIndex
CREATE INDEX "Discount_studentId_idx" ON "Discount"("studentId");

-- CreateIndex
CREATE INDEX "Discount_companyId_idx" ON "Discount"("companyId");

-- CreateIndex
CREATE INDEX "Discount_deletedAt_idx" ON "Discount"("deletedAt");

-- CreateIndex
CREATE INDEX "Scholarship_studentId_idx" ON "Scholarship"("studentId");

-- CreateIndex
CREATE INDEX "Scholarship_companyId_idx" ON "Scholarship"("companyId");

-- CreateIndex
CREATE INDEX "Scholarship_deletedAt_idx" ON "Scholarship"("deletedAt");

-- CreateIndex
CREATE INDEX "InstallmentPlan_contractId_idx" ON "InstallmentPlan"("contractId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_companyId_idx" ON "InstallmentPlan"("companyId");

-- CreateIndex
CREATE INDEX "Installment_dueDate_idx" ON "Installment"("dueDate");

-- CreateIndex
CREATE INDEX "Installment_status_idx" ON "Installment"("status");

-- CreateIndex
CREATE INDEX "Installment_companyId_idx" ON "Installment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_planId_sequenceNum_key" ON "Installment"("planId", "sequenceNum");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_companyId_type_key" ON "AlertRule"("companyId", "type");

-- CreateIndex
CREATE INDEX "Alert_companyId_idx" ON "Alert"("companyId");

-- CreateIndex
CREATE INDEX "Alert_type_idx" ON "Alert"("type");

-- CreateIndex
CREATE INDEX "Alert_acknowledgedAt_idx" ON "Alert"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scholarship" ADD CONSTRAINT "Scholarship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

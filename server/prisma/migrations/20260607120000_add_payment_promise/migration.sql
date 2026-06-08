-- CreateEnum
CREATE TYPE "PaymentPromiseStatus" AS ENUM ('OPEN', 'KEPT', 'BROKEN', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PROMISE_OVERDUE';

-- CreateTable
CREATE TABLE "PaymentPromise" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "promisedAmount" INTEGER,
    "promiseDate" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "status" "PaymentPromiseStatus" NOT NULL DEFAULT 'OPEN',
    "balanceAtPromise" INTEGER NOT NULL,
    "reminderFiredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "createdById" INTEGER NOT NULL,
    "branchId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPromise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentPromise_studentId_idx" ON "PaymentPromise"("studentId");

-- CreateIndex
CREATE INDEX "PaymentPromise_companyId_status_idx" ON "PaymentPromise"("companyId", "status");

-- CreateIndex
CREATE INDEX "PaymentPromise_status_promiseDate_idx" ON "PaymentPromise"("status", "promiseDate");

-- CreateIndex
CREATE INDEX "PaymentPromise_branchId_idx" ON "PaymentPromise"("branchId");

-- Partial unique: at most one OPEN payment promise per student
-- (mirrors the tx_initial_balance_per_student_unique precedent).
CREATE UNIQUE INDEX "payment_promise_open_per_student_unique" ON "PaymentPromise"("studentId") WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "PaymentPromise" ADD CONSTRAINT "PaymentPromise_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPromise" ADD CONSTRAINT "PaymentPromise_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPromise" ADD CONSTRAINT "PaymentPromise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPromise" ADD CONSTRAINT "PaymentPromise_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

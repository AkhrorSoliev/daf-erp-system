-- CreateEnum
CREATE TYPE "LessonDeductionMode" AS ENUM ('FULL_CYCLE', 'PARTIAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'LESSON_CONSUMPTION';
ALTER TYPE "TransactionType" ADD VALUE 'INITIAL_BALANCE';

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "cancellationId" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "prepaidLessonsRemaining" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalaryAccrual" ADD COLUMN     "perLessonCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" INTEGER,
ADD COLUMN     "salaryConfigVersionId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "EmployeeSalaryConfigVersion" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "salaryType" "SalaryType" NOT NULL,
    "value" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "changedById" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalaryConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPeriodSetting" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cycleStartDay" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryPeriodSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonCancellation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "cancelledById" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "deletionBatchId" TEXT,

    CONSTRAINT "LessonCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeSalaryConfigVersion_configId_effectiveFrom_idx" ON "EmployeeSalaryConfigVersion"("configId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeSalaryConfigVersion_effectiveFrom_effectiveTo_idx" ON "EmployeeSalaryConfigVersion"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "EmployeeSalaryConfigVersion_companyId_idx" ON "EmployeeSalaryConfigVersion"("companyId");

-- CreateIndex
CREATE INDEX "SalaryPeriodSetting_companyId_effectiveFrom_idx" ON "SalaryPeriodSetting"("companyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SalaryPeriodSetting_effectiveFrom_effectiveTo_idx" ON "SalaryPeriodSetting"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "LessonCancellation_date_idx" ON "LessonCancellation"("date");

-- CreateIndex
CREATE INDEX "LessonCancellation_companyId_idx" ON "LessonCancellation"("companyId");

-- CreateIndex
CREATE INDEX "LessonCancellation_deletedAt_idx" ON "LessonCancellation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonCancellation_groupId_date_key" ON "LessonCancellation"("groupId", "date");

-- CreateIndex
CREATE INDEX "Attendance_cancellationId_idx" ON "Attendance"("cancellationId");

-- CreateIndex
CREATE INDEX "SalaryAccrual_salaryConfigVersionId_idx" ON "SalaryAccrual"("salaryConfigVersionId");

-- CreateIndex
CREATE INDEX "SalaryAccrual_reversedAt_idx" ON "SalaryAccrual"("reversedAt");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "LessonCancellation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryConfigVersion" ADD CONSTRAINT "EmployeeSalaryConfigVersion_configId_fkey" FOREIGN KEY ("configId") REFERENCES "EmployeeSalaryConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryConfigVersion" ADD CONSTRAINT "EmployeeSalaryConfigVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPeriodSetting" ADD CONSTRAINT "SalaryPeriodSetting_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCancellation" ADD CONSTRAINT "LessonCancellation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCancellation" ADD CONSTRAINT "LessonCancellation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCancellation" ADD CONSTRAINT "LessonCancellation_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAccrual" ADD CONSTRAINT "SalaryAccrual_salaryConfigVersionId_fkey" FOREIGN KEY ("salaryConfigVersionId") REFERENCES "EmployeeSalaryConfigVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAccrual" ADD CONSTRAINT "SalaryAccrual_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: SalaryAccrual.student / .group relations (Faza 2 needs them
-- for the breakdown report). The `studentId`/`groupId` columns already
-- existed; we're just adding the FK constraints + Prisma-level relations.
ALTER TABLE "SalaryAccrual" ADD CONSTRAINT "SalaryAccrual_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAccrual" ADD CONSTRAINT "SalaryAccrual_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ================================================================================
-- Partial unique indexes (Prisma cannot express these in schema.prisma)
-- ================================================================================

-- LESSON_CONSUMPTION idempotency: per attendance, at most one ACTIVE consumption.
-- Reverse pairs (reversedTransactionId IS NOT NULL) and the original they
-- reverse coexist temporarily; the partial WHERE excludes reversed pairs so a
-- new consumption can be written after a reversal.
CREATE UNIQUE INDEX "tx_consumption_per_attendance_unique"
ON "Transaction"("attendanceId")
WHERE "type" = 'LESSON_CONSUMPTION' AND "reversedTransactionId" IS NULL;

-- INITIAL_BALANCE: at most one per student, ever. Re-running the seed flow
-- must error rather than double-credit.
CREATE UNIQUE INDEX "tx_initial_balance_per_student_unique"
ON "Transaction"("studentId")
WHERE "type" = 'INITIAL_BALANCE';

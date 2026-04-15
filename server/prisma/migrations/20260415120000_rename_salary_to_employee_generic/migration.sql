-- Rename salary system from teacher-specific to generic employee salary.
-- This migration preserves all existing data via RENAME operations.

-- 1. Add FIXED_MONTHLY to SalaryType enum (for non-teacher employees paid a flat monthly salary).
ALTER TYPE "SalaryType" ADD VALUE 'FIXED_MONTHLY';

-- 2. Rename TeacherSalaryConfig table → EmployeeSalaryConfig.
ALTER TABLE "TeacherSalaryConfig" RENAME TO "EmployeeSalaryConfig";

-- 3. Rename teacherId → userId in all three salary tables.
ALTER TABLE "EmployeeSalaryConfig" RENAME COLUMN "teacherId" TO "userId";
ALTER TABLE "SalaryAccrual" RENAME COLUMN "teacherId" TO "userId";
ALTER TABLE "SalaryPayment" RENAME COLUMN "teacherId" TO "userId";

-- 4. Rename primary key constraint.
ALTER TABLE "EmployeeSalaryConfig" RENAME CONSTRAINT "TeacherSalaryConfig_pkey" TO "EmployeeSalaryConfig_pkey";

-- 5. Rename foreign key constraints.
ALTER TABLE "EmployeeSalaryConfig" RENAME CONSTRAINT "TeacherSalaryConfig_teacherId_fkey" TO "EmployeeSalaryConfig_userId_fkey";
ALTER TABLE "EmployeeSalaryConfig" RENAME CONSTRAINT "TeacherSalaryConfig_groupId_fkey" TO "EmployeeSalaryConfig_groupId_fkey";
ALTER TABLE "SalaryAccrual" RENAME CONSTRAINT "SalaryAccrual_teacherId_fkey" TO "SalaryAccrual_userId_fkey";
ALTER TABLE "SalaryPayment" RENAME CONSTRAINT "SalaryPayment_teacherId_fkey" TO "SalaryPayment_userId_fkey";

-- 6. Rename indexes.
ALTER INDEX "TeacherSalaryConfig_teacherId_idx" RENAME TO "EmployeeSalaryConfig_userId_idx";
ALTER INDEX "TeacherSalaryConfig_companyId_idx" RENAME TO "EmployeeSalaryConfig_companyId_idx";
ALTER INDEX "TeacherSalaryConfig_teacherId_groupId_key" RENAME TO "EmployeeSalaryConfig_userId_groupId_key";
ALTER INDEX "SalaryAccrual_teacherId_salaryPaymentId_idx" RENAME TO "SalaryAccrual_userId_salaryPaymentId_idx";
ALTER INDEX "SalaryAccrual_teacherId_studentId_groupId_lessonDate_key" RENAME TO "SalaryAccrual_userId_studentId_groupId_lessonDate_key";
ALTER INDEX "SalaryPayment_teacherId_idx" RENAME TO "SalaryPayment_userId_idx";

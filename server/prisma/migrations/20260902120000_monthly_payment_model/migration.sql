-- CreateEnum
CREATE TYPE "PaymentModel" AS ENUM ('LESSON_PACK', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MonthlyChargeStatus" AS ENUM ('CHARGED', 'REVERSED');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "paymentModel" "PaymentModel" NOT NULL DEFAULT 'LESSON_PACK';

-- CreateTable
CREATE TABLE "EnrollmentMonthlyCharge" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "plannedLessons" INTEGER NOT NULL,
    "perLessonCost" INTEGER NOT NULL,
    "monthlyPrice" INTEGER NOT NULL,
    "coveredLessons" INTEGER NOT NULL,
    "creditLessons" INTEGER NOT NULL DEFAULT 0,
    "creditAmount" INTEGER NOT NULL DEFAULT 0,
    "chargedAmount" INTEGER NOT NULL,
    "excusedLessons" INTEGER NOT NULL DEFAULT 0,
    "status" "MonthlyChargeStatus" NOT NULL DEFAULT 'CHARGED',
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentMonthlyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrollmentMonthlyCharge_studentId_periodYear_periodMonth_idx" ON "EnrollmentMonthlyCharge"("studentId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "EnrollmentMonthlyCharge_groupId_periodYear_periodMonth_idx" ON "EnrollmentMonthlyCharge"("groupId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "EnrollmentMonthlyCharge_branchId_periodYear_periodMonth_idx" ON "EnrollmentMonthlyCharge"("branchId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentMonthlyCharge_enrollmentId_periodYear_periodMonth_key" ON "EnrollmentMonthlyCharge"("enrollmentId", "periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "EnrollmentMonthlyCharge" ADD CONSTRAINT "EnrollmentMonthlyCharge_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentMonthlyCharge" ADD CONSTRAINT "EnrollmentMonthlyCharge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentMonthlyCharge" ADD CONSTRAINT "EnrollmentMonthlyCharge_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentMonthlyCharge" ADD CONSTRAINT "EnrollmentMonthlyCharge_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentMonthlyCharge" ADD CONSTRAINT "EnrollmentMonthlyCharge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN     "frozenOutDates" TEXT[] DEFAULT ARRAY[]::TEXT[];

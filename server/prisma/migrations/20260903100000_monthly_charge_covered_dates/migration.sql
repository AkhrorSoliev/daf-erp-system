-- AlterTable
ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN     "coveredDates" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ADR-0080: existing companies get the moment this runs, so leads created before the deploy never get a «Qo'ng'iroqsiz lid» task.
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "uncalledLeadTasksFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

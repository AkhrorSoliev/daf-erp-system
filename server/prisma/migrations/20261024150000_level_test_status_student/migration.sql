-- CreateEnum
CREATE TYPE "LevelTestStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'STOPPED', 'TIMED_OUT', 'CANCELLED');

-- DropIndex
DROP INDEX "LevelTestAttempt_companyId_idx";

-- AlterTable
ALTER TABLE "LevelTestAttempt" ADD COLUMN     "answered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "LevelTestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "studentId" INTEGER,
ALTER COLUMN "result" DROP NOT NULL;

-- Backfill: until now an attempt was written only when the test ended, so every
-- existing row is a finished one.
UPDATE "LevelTestAttempt"
SET "status" = 'COMPLETED',
    "answered" = COALESCE(array_length("questionIds", 1), 0),
    "finishedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "LevelTestAttempt_studentId_createdAt_idx" ON "LevelTestAttempt"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "LevelTestAttempt_companyId_createdAt_idx" ON "LevelTestAttempt"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "LevelTestAttempt" ADD CONSTRAINT "LevelTestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

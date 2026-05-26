-- AlterEnum: new statuses / transaction types
ALTER TYPE "StudentStatus" ADD VALUE 'PROSPECT';
ALTER TYPE "TransactionType" ADD VALUE 'MOCK_EXAM_FEE';

-- MockExam: price + cached results PDF
ALTER TABLE "MockExam"
  ADD COLUMN "price" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resultsPdfFileKey" TEXT,
  ADD COLUMN "resultsPdfGeneratedAt" TIMESTAMP(3);

-- MockExamParticipant: studentId becomes the canonical link.
-- 1. Drop the rows that have no studentId (impossible to satisfy NOT NULL).
--    There is no production data at this point (Faza 0-6 was dev-only).
DELETE FROM "MockExamSubjectScore"
WHERE "participantId" IN (
  SELECT "id" FROM "MockExamParticipant" WHERE "studentId" IS NULL
);
DELETE FROM "MockExamParticipant" WHERE "studentId" IS NULL;

-- 2. Drop the now-stale unique on (examId, telegramChatId) and the old FK.
ALTER TABLE "MockExamParticipant" DROP CONSTRAINT "MockExamParticipant_studentId_fkey";
DROP INDEX "MockExamParticipant_examId_telegramChatId_key";
DROP INDEX "MockExamParticipant_studentId_idx";

-- 3. Promote studentId to NOT NULL, telegramChatId to nullable, add payment cols.
ALTER TABLE "MockExamParticipant"
  ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paymentTransactionId" TEXT,
  ALTER COLUMN "telegramChatId" DROP NOT NULL,
  ALTER COLUMN "studentId" SET NOT NULL;

-- 4. New indexes + uniqueness keyed on studentId.
CREATE INDEX "MockExamParticipant_telegramChatId_idx" ON "MockExamParticipant"("telegramChatId");
CREATE UNIQUE INDEX "MockExamParticipant_examId_studentId_key" ON "MockExamParticipant"("examId", "studentId");

-- 5. New FK with RESTRICT (cannot delete a Student with mock participations).
ALTER TABLE "MockExamParticipant"
  ADD CONSTRAINT "MockExamParticipant_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

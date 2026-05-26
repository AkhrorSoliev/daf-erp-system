-- MockExamParticipant identity rework:
--   * `publicId` becomes the canonical 5-digit identity (drawn from the
--     shared `Student_id_seq`).
--   * `studentId` goes back to optional — a participant is a Student only
--     when they're an actual DaF student (already registered) or after
--     admin manually converts them.
--   * Drop `paymentTransactionId` — we mark `paid` directly without a
--     Transaction row (per the simple-billing decision).
--
-- The previous migration deleted all rows, so there is nothing to
-- backfill. The `ADD COLUMN ... NOT NULL` would fail with existing rows
-- since publicId has no default; the empty table makes it safe.

-- 1. Drop the FK so we can drop the index it depends on.
ALTER TABLE "MockExamParticipant"
  DROP CONSTRAINT "MockExamParticipant_studentId_fkey";

-- 2. Drop the now-stale (examId, studentId) unique — studentId is becoming
--    nullable and we'll key uniqueness on the new publicId instead.
DROP INDEX "MockExamParticipant_examId_studentId_key";

-- 3. Make studentId nullable, drop the unused paymentTransactionId, add
--    the new publicId column.
ALTER TABLE "MockExamParticipant"
  DROP COLUMN "paymentTransactionId",
  ADD COLUMN "publicId" INTEGER NOT NULL,
  ALTER COLUMN "studentId" DROP NOT NULL;

-- 4. Indexes / uniqueness keyed on publicId.
CREATE UNIQUE INDEX "MockExamParticipant_publicId_key" ON "MockExamParticipant"("publicId");
CREATE UNIQUE INDEX "MockExamParticipant_examId_publicId_key" ON "MockExamParticipant"("examId", "publicId");
CREATE INDEX "MockExamParticipant_studentId_idx" ON "MockExamParticipant"("studentId");

-- 5. Re-add the FK with SetNull (so deleting a Student doesn't blow away
--    their historical mock entries — they just become "unlinked").
ALTER TABLE "MockExamParticipant"
  ADD CONSTRAINT "MockExamParticipant_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

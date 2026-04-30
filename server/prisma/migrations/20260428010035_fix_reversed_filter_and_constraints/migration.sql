-- ================================================================================
-- Faza 8 audit fixes — invariants for the prepaid billing model.
--
-- 1) Add Transaction.reversedAt + reversedById so idempotency filters and
--    partial unique indexes can identify "still-active" rows in O(1)
--    without a sub-query. Without this, the LESSON_CONSUMPTION uniqueness
--    check finds reversed originals and incorrectly blocks ABSENT→PRESENT
--    re-billing.
--
-- 2) Tighten the partial unique indexes to use reversedAt IS NULL, which
--    matches the new invariant and stops a P2002 from firing on legitimate
--    re-bills after a reversal.
--
-- 3) Replace LessonCancellation's plain @@unique([groupId, date]) with a
--    partial unique that scopes to deletedAt IS NULL. Soft-deleting a
--    cancellation must not block creating a new one for the same lesson.
-- ================================================================================

-- AlterTable: Transaction.reversedAt + reversedById
ALTER TABLE "Transaction" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "reversedById" INTEGER;

-- Backfill: any existing row that another row already points back at via
-- reversedTransactionId is, by definition, reversed. Mark them with the
-- reversal entry's createdAt so the new index is consistent with history.
UPDATE "Transaction" t
SET "reversedAt" = (
  SELECT r."createdAt"
  FROM "Transaction" r
  WHERE r."reversedTransactionId" = t.id
  ORDER BY r."createdAt" ASC
  LIMIT 1
),
"reversedById" = (
  SELECT r."performedById"
  FROM "Transaction" r
  WHERE r."reversedTransactionId" = t.id
  ORDER BY r."createdAt" ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM "Transaction" r WHERE r."reversedTransactionId" = t.id
);

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Transaction_reversedAt_idx" ON "Transaction"("reversedAt");

-- Replace partial unique indexes to scope on reversedAt IS NULL.
DROP INDEX IF EXISTS "tx_consumption_per_attendance_unique";
CREATE UNIQUE INDEX "tx_consumption_per_attendance_unique"
ON "Transaction"("attendanceId")
WHERE "type" = 'LESSON_CONSUMPTION' AND "reversedAt" IS NULL;

DROP INDEX IF EXISTS "tx_initial_balance_per_student_unique";
CREATE UNIQUE INDEX "tx_initial_balance_per_student_unique"
ON "Transaction"("studentId")
WHERE "type" = 'INITIAL_BALANCE' AND "reversedAt" IS NULL;

-- ================================================================================
-- LessonCancellation: replace plain unique with partial-unique scoped to
-- the active (un-deleted) row. Soft-delete must not block re-creation.
-- ================================================================================

ALTER TABLE "LessonCancellation" DROP CONSTRAINT IF EXISTS "LessonCancellation_groupId_date_key";
DROP INDEX IF EXISTS "LessonCancellation_groupId_date_key";

CREATE UNIQUE INDEX "lesson_cancellation_active_unique"
ON "LessonCancellation"("groupId", "date")
WHERE "deletedAt" IS NULL;

-- An ordinary index keeps the read path fast for the (groupId, date) lookup
-- regardless of soft-delete state.
CREATE INDEX IF NOT EXISTS "LessonCancellation_groupId_date_idx"
ON "LessonCancellation"("groupId", "date");

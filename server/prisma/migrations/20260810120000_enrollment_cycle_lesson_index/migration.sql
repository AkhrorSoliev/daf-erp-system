-- Enrollment.cycleLessonIndex — where an enrollment stands inside its billing cycle.
--
-- Only the lesson-by-lesson path (a debtor with no prepaid batch) needs it: it
-- is the one billing route with nothing recording that the next lesson is the
-- cycle's last and must settle the rounding remainder. See
-- `src/billing/lesson-price.ts`.
--
-- Safe on a live table: NOT NULL with a DEFAULT, so existing rows fill in
-- without a rewrite lock on Postgres 11+, and the old code simply ignores the
-- column until the new build ships.
ALTER TABLE "Enrollment"
  ADD COLUMN IF NOT EXISTS "cycleLessonIndex" INTEGER NOT NULL DEFAULT 0;

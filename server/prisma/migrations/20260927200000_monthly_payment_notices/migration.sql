-- Monthly payment notices (ADR-0042): the month's bill and the 2nd-lesson
-- reminder are two new Telegram digest categories.
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'MONTHLY_CHARGE';
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER';

-- When a charge's bill was queued (or deliberately skipped). NULL = not yet.
ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN "noticeQueuedAt" TIMESTAMP(3);

-- Charges written before the notices existed are never announced: without
-- this the first run would send every student a bill for a month already
-- under way.
UPDATE "EnrollmentMonthlyCharge"
SET "noticeQueuedAt" = CURRENT_TIMESTAMP
WHERE "noticeQueuedAt" IS NULL;

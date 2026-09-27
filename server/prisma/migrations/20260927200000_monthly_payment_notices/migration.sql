-- Monthly payment notices (ADR-0042): the month's bill and the 2nd-lesson
-- reminder are two new Telegram digest categories.
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'MONTHLY_CHARGE';
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER';

-- When a charge's bill was queued (or deliberately skipped). NULL = not yet.
ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN "noticeQueuedAt" TIMESTAMP(3);

-- Charges written before the deploy day are never announced: without this
-- the first run would send every student a bill for a month already under
-- way. Charges written today (Tashkent) are spared, so a deploy on the charge
-- day still sends that month's bills. "createdAt" holds UTC.
UPDATE "EnrollmentMonthlyCharge"
SET "noticeQueuedAt" = CURRENT_TIMESTAMP
WHERE "noticeQueuedAt" IS NULL
  AND "createdAt" < ((date_trunc('day', now() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'UTC');

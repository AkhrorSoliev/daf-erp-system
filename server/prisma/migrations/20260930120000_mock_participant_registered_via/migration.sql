-- Where a mock registration came from: the Telegram bot or an admin's
-- «Qo'lda qo'shish». Stored on the row so statistics never infer it (ADR-0056).
CREATE TYPE "MockRegistrationChannel" AS ENUM ('BOT', 'ADMIN');

ALTER TABLE "MockExamParticipant" ADD COLUMN "registeredVia" "MockRegistrationChannel";

-- 1) Added by staff: the participant's CREATE history row names its author.
UPDATE "MockExamParticipant" p
SET "registeredVia" = 'ADMIN'
WHERE EXISTS (
  SELECT 1
  FROM "EntityHistory" h
  WHERE h."entityType" = 'MockExamParticipant'
    AND h."entityId" = p."id"
    AND h."action" = 'CREATE'
    AND h."changedById" IS NOT NULL
);

-- 2) The bot always stores the sender's Telegram first name; the admin form
--    has no such field. (Prod 30.09: 111 bot rows, 50 of them with no history.)
UPDATE "MockExamParticipant"
SET "registeredVia" = 'BOT'
WHERE "registeredVia" IS NULL
  AND "telegramFirstName" IS NOT NULL;

-- 3) Anything left came through the admin form.
UPDATE "MockExamParticipant"
SET "registeredVia" = 'ADMIN'
WHERE "registeredVia" IS NULL;

ALTER TABLE "MockExamParticipant" ALTER COLUMN "registeredVia" SET NOT NULL;

-- AlterEnum
-- Split the legacy combined PROMISED ("keladi / to'laydi dedi") into two
-- distinct outcomes. PROMISED is kept for existing rows. PostgreSQL 12+
-- (Neon) allows adding multiple enum values; the new values are not used
-- within this migration, so it is replay-safe.
ALTER TYPE "CallOutcome" ADD VALUE 'WILL_COME';
ALTER TYPE "CallOutcome" ADD VALUE 'WILL_PAY';

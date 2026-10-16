-- ADR-0090: the Telegram copy of a lesson alert, edited when the row is resolved.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "telegramMessageId" INTEGER;

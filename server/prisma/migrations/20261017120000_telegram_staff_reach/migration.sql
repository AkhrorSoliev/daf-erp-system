-- Xodim Telegram'iga xabar yetib borishi (ADR-0097).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramDisconnectedAt" TIMESTAMP(3);
ALTER TABLE "TelegramReportRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "TelegramReportRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptOk" BOOLEAN;
ALTER TABLE "TelegramReportRecipient" ADD COLUMN IF NOT EXISTS "lastAttemptNote" TEXT;

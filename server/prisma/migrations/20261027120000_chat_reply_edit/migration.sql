-- Chat: reply to a message, edit within 3 hours (the CEO keeps the first text),
-- and one editable Telegram notice per unread stretch.
ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "replyToId" TEXT,
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "originalText" TEXT;

ALTER TABLE "ChatNotifyState"
  ADD COLUMN IF NOT EXISTS "telegramMessageId" INTEGER,
  ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER NOT NULL DEFAULT 0;

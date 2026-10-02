-- A student's Telegram chat the bot can no longer reach (ADR-0066).
ALTER TABLE "Student" ADD COLUMN "telegramDisconnectedAt" TIMESTAMP(3);

-- Chats that already refused the bot. Every send to a student is logged in
-- "SmsMessage" (the SMS tab), with Telegram's own error text on a failure. A
-- chat is marked when its LATEST real attempt failed for good: the student
-- blocked the bot, deleted the Telegram account, or the chat is gone. The
-- latest attempt is taken per chat, not per student, because a parent's chat
-- can serve several cards and a delivery to any of them proves the chat
-- works. Rows written without calling Telegram (no chat linked, bot down) are
-- not attempts. Only live cards are marked, as the bot marks them. A chat
-- marked here and reachable again is cleared by the next delivery or by the
-- student's unblock.
WITH attempt AS (
  SELECT s."telegramChatId" AS chat, m."status", m."errorMessage", m."createdAt"
  FROM "SmsMessage" m
  JOIN "Student" s ON s."id" = m."studentId"
  WHERE s."telegramChatId" IS NOT NULL
    AND s."telegramChatId" <> ''
    AND m."errorMessage" IS DISTINCT FROM 'Telegram bog''lanmagan'
    AND m."errorMessage" IS DISTINCT FROM 'Telegram bot ishlamayapti'
),
latest AS (
  SELECT DISTINCT ON (chat) chat, "status", "errorMessage", "createdAt"
  FROM attempt
  ORDER BY chat, "createdAt" DESC
)
UPDATE "Student" s
SET "telegramDisconnectedAt" = latest."createdAt"
FROM latest
WHERE s."telegramChatId" = latest.chat
  AND s."deletedAt" IS NULL
  AND latest."status" = 'FAILED'
  AND latest."errorMessage" ~* '(blocked|deactivated|chat not found|kicked|PEER_ID_INVALID|can''t initiate conversation)';

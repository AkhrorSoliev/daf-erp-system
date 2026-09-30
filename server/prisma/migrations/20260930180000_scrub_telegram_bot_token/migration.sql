-- A Telegram error can quote the Bot API URL, and that URL holds the bot
-- token. Stored error texts are shown to staff (the SMS tab, «Tarix»), so
-- any token in them becomes bot*** — the same rule as `describeError`.
-- Production had none on 2026-09-30; this catches what the old code writes
-- before the fix is live.
UPDATE "SmsMessage"
SET "errorMessage" = regexp_replace("errorMessage", 'bot[0-9]+:[A-Za-z0-9_-]+', 'bot***', 'g')
WHERE "errorMessage" ~ 'bot[0-9]+:[A-Za-z0-9_-]+';

UPDATE "MockExamParticipant"
SET "resultSendError" = regexp_replace("resultSendError", 'bot[0-9]+:[A-Za-z0-9_-]+', 'bot***', 'g')
WHERE "resultSendError" ~ 'bot[0-9]+:[A-Za-z0-9_-]+';

-- SMS_YUBORILMADI history rows copy the error into "holat".
UPDATE "EntityHistory"
SET "newValues" = jsonb_set(
  "newValues",
  '{holat}',
  to_jsonb(regexp_replace("newValues"->>'holat', 'bot[0-9]+:[A-Za-z0-9_-]+', 'bot***', 'g'))
)
WHERE "entityType" = 'Student'
  AND "newValues"->>'holat' ~ 'bot[0-9]+:[A-Za-z0-9_-]+';

-- LOCAL ONLY (throwaway DB daf_s1_yuklama). Back to the state before daf-yuklama-s4-seed.ts:
-- no reminder log rows, no fake Telegram chats, reminder switches as they were.
-- Needs the snapshot _bak_s4_setting that the seed makes on its first run. Run:
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f this file
-- (ON_ERROR_STOP is what makes the guard below stop the script), then VACUUM ANALYZE the touched tables.
-- Guard: aborts everywhere except the throwaway DB (the statements below delete data).
DO $$ BEGIN IF current_database() <> 'daf_s1_yuklama' THEN RAISE EXCEPTION 'tiklash.sql: only for daf_s1_yuklama (got %)', current_database(); END IF; END $$;
BEGIN;
DELETE FROM "DafReminderLog";
UPDATE "Student" SET "telegramChatId" = NULL, "telegramDisconnectedAt" = NULL
  WHERE "telegramChatId" IS NOT NULL OR "telegramDisconnectedAt" IS NOT NULL;
DELETE FROM "DafStudentSetting" s WHERE NOT EXISTS (SELECT 1 FROM _bak_s4_setting b WHERE b."studentId" = s."studentId");
UPDATE "DafStudentSetting" s SET "remindersEnabled" = b."remindersEnabled"
  FROM _bak_s4_setting b WHERE b."studentId" = s."studentId" AND s."remindersEnabled" <> b."remindersEnabled";
COMMIT;
SELECT (SELECT count(*) FROM "DafReminderLog") log, (SELECT count(*) FROM "Student" WHERE "telegramChatId" IS NOT NULL) chats, (SELECT count(*) FROM "DafStudentSetting") settings, (SELECT count(*) FROM "DafStudentSetting" WHERE NOT "remindersEnabled") off;

-- LOCAL ONLY (throwaway DB daf_s1_yuklama). Back to the state right after daf-yuklama-s3-seed.ts:
-- last week unsettled, no current-week league rows, tiers and badges as seeded.
-- Needs the snapshots _bak_tier and _bak_badge that daf-yuklama-s3-kech.ts makes on its first
-- run (the DB must still be in the seeded state then). Run: psql "$DATABASE_URL" -f this file,
-- then VACUUM ANALYZE the Daf* tables (dead tuples slow the next measurement).
BEGIN;
DELETE FROM "DafLeagueEntry" WHERE "weekStart" >= (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date;
DELETE FROM "DafLeagueRoom" WHERE "weekStart" >= (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date;
UPDATE "DafLeagueEntry" SET place = NULL, points = NULL, promoted = false;
UPDATE "DafLeagueRoom" SET "settledAt" = NULL;
DELETE FROM "DafGroupWeek";
UPDATE "DafStudentLeague" s SET tier = b.tier FROM _bak_tier b WHERE b."studentId" = s."studentId" AND s.tier <> b.tier;
DELETE FROM "DafStudentLeague" s WHERE NOT EXISTS (SELECT 1 FROM _bak_tier b WHERE b."studentId" = s."studentId");
DELETE FROM "DafStudentBadge" WHERE id NOT IN (SELECT id FROM _bak_badge);
COMMIT;
SELECT (SELECT count(*) FROM "DafLeagueRoom" WHERE "settledAt" IS NULL) unsettled, (SELECT count(*) FROM "DafLeagueEntry") entries, (SELECT count(*) FROM "DafGroupWeek") gw, (SELECT count(*) FROM "DafStudentBadge") badges;

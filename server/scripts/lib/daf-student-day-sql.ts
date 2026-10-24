import { Prisma } from '@prisma/client';

/**
 * Expected day totals, built from DafAttempt by the same rule as
 * `kunlikKalit` (src/daf/shared/attempt-writer.ts): the Tashkent day of
 * "createdAt" (+5 h, no DST) and the sealed group ("" for none).
 * The migration 20261018200000_daf_student_day carries a copy of the
 * INSERT; keep the two the same.
 */
const EXPECTED = Prisma.sql`
  SELECT "studentId", "companyId",
         ("createdAt" + interval '5 hours')::date AS day,
         COALESCE("groupId", '') AS "groupKey",
         COALESCE(SUM("points"), 0)::int AS points,
         COUNT(*)::int AS attempts
  FROM "DafAttempt"
  GROUP BY 1, 2, 3, 4`;

export const DIFF_SQL = Prisma.sql`
  WITH e AS (${EXPECTED})
  SELECT COALESCE(e."studentId", d."studentId") AS "studentId",
         to_char(COALESCE(e.day, d.day), 'YYYY-MM-DD') AS day,
         COALESCE(e."groupKey", d."groupKey") AS "groupKey",
         e.points AS "expectedPoints", d.points AS "actualPoints",
         e.attempts AS "expectedAttempts", d.attempts AS "actualAttempts"
  FROM e
  FULL OUTER JOIN "DafStudentDay" d
    ON d."studentId" = e."studentId" AND d.day = e.day AND d."groupKey" = e."groupKey"
  WHERE e.points IS DISTINCT FROM d.points
     OR e.attempts IS DISTINCT FROM d.attempts
     OR e."companyId" IS DISTINCT FROM d."companyId"
  ORDER BY 1, 2, 3
  LIMIT 1000`;

export const REBUILD_SQL = Prisma.sql`
  INSERT INTO "DafStudentDay" ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
  SELECT "studentId", "companyId", day, "groupKey", points, attempts, now()
  FROM (${EXPECTED}) e`;

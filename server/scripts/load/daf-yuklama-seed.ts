/**
 * LOCAL ONLY. Fills a throwaway DB for the S1 load test: 5 000 students,
 * ~1 M attempts this week + ~300 k over the last 90 days, then rebuilds the
 * day totals and checks them (spec §6).
 */
import { run } from '../lib/check-cli';
import { REBUILD_SQL, DIFF_SQL } from '../lib/daf-student-day-sql';
import { assertLocalDb } from './local-db-guard';

assertLocalDb();

run(async (prisma) => {
  await prisma.$executeRaw`DELETE FROM "DafStudentDay"`;
  await prisma.$executeRaw`DELETE FROM "DafAttempt"`;
  const week = await prisma.$executeRaw`
    INSERT INTO "DafAttempt" ("studentId", "companyId", "groupId", "isCorrect", "given", "points", "createdAt")
    SELECT s.id, s."companyId", e."groupId", true, '"x"'::jsonb,
           CASE WHEN random() < 0.5 THEN 10 ELSE 0 END,
           w.monday + random() * (w.utc_now - w.monday)
    FROM (SELECT id, "companyId" FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 5000) s
    LEFT JOIN LATERAL (
      SELECT "groupId" FROM "Enrollment"
      WHERE "studentId" = s.id AND status = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1
    ) e ON true
    CROSS JOIN generate_series(1, 200)
    CROSS JOIN (
      -- "createdAt" is UTC without a time zone: say UTC explicitly.
      SELECT (now() AT TIME ZONE 'UTC') AS utc_now,
             date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours') - interval '5 hours' AS monday
    ) w`;
  const history = await prisma.$executeRaw`
    INSERT INTO "DafAttempt" ("studentId", "companyId", "groupId", "isCorrect", "given", "points", "createdAt")
    SELECT s.id, s."companyId", NULL, true, '"x"'::jsonb, 10, (now() AT TIME ZONE 'UTC') - random() * interval '90 days'
    FROM (SELECT id, "companyId" FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 5000) s
    CROSS JOIN generate_series(1, 60)`;
  await prisma.$executeRaw(REBUILD_SQL);
  await prisma.$executeRaw`ANALYZE "DafAttempt"`;
  await prisma.$executeRaw`ANALYZE "DafStudentDay"`;
  const diff = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log({ week, history, diff: diff.length });
  if (diff.length > 0) process.exitCode = 1;
});

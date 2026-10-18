/**
 * LOCAL ONLY. Adds the S2 data to the load-test DB (spec S2 §8), AFTER
 * `daf-yuklama-seed.ts`: goal settings, word states, long streaks and the
 * badge rows that make `seansNatijasi` take its INSERT path. Cohorts are in
 * `daf-yuklama-kohort.ts`.
 *
 * Run it once per fresh DB: it refuses when streak attempts or badges are
 * already there (`DafStudentBadge` has one writer, `grantBadges`, so this
 * script cannot clear it — re-create the DB instead).
 */
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { DIFF_SQL } from '../lib/daf-student-day-sql';
import { assertLocalDb } from './local-db-guard';
import {
  GROUP_OF,
  KOHORT,
  KOHORT_SQL,
  type KohortNomi,
} from './daf-yuklama-kohort';
import { grantBadges } from '../../src/daf/nishon/nishon-berish';
import { bugunBoshmi } from '../../src/daf/fortschritt/maqsad';

assertLocalDb();

const SERI_SESSION = 's2-seri';
const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

const ks = (nomi: KohortNomi) => [...KOHORT[nomi]];

run(async (prisma) => {
  if (
    (await prisma.dafStudentBadge.count()) > 0 ||
    (await prisma.dafAttempt.count({ where: { sessionId: SERI_SESSION } })) > 0
  ) {
    throw new Error(
      'S2 ma`lumot allaqachon bor (nishon yoki seriya urinishlari). Bazani qayta yarating.',
    );
  }

  // Goal settings: even ids JIDDIY, id % 4 = 1 YENGIL, the rest no row (ORTA).
  await prisma.$executeRaw`DELETE FROM "DafStudentSetting"`;
  const sozlama = await prisma.$executeRaw`
    INSERT INTO "DafStudentSetting" ("studentId", "companyId", "dailyGoal", "updatedAt")
    SELECT id, "companyId",
           CASE WHEN id % 2 = 0 THEN 'JIDDIY' ELSE 'YENGIL' END::"DafDailyGoal", now()
    FROM "Student" WHERE "deletedAt" IS NULL AND (id % 2 = 0 OR id % 4 = 1)`;

  // Word states. `dueAt` in the past = due now; in the future = not due.
  await prisma.$executeRaw`DELETE FROM "DafLexemeState"`;
  const sozHolati = async (
    nomi: KohortNomi,
    n: number,
    dueAt: Prisma.Sql,
    correct: number,
  ) =>
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "DafLexemeState"
        ("studentId", "lexemeId", "strength", "dueAt", "lastSeenAt", "correctCount", "wrongCount", "companyId")
      SELECT c.id, x.id, 3, ${dueAt}, ${UTC_NOW} - interval '1 day', ${correct}, 0, c."companyId"
      FROM (${KOHORT_SQL}) c
      CROSS JOIN LATERAL (SELECT id FROM "DafLexeme" ORDER BY id LIMIT ${n}) x
      WHERE c.k = ANY(${ks(nomi)}::int[])`);
  const past = Prisma.sql`${UTC_NOW} - interval '1 hour'`;
  const future = Prisma.sql`${UTC_NOW} + interval '30 days'`;
  const lexemeSoni = await prisma.dafLexeme.count();
  const states = {
    DUE: await sozHolati('DUE', 20, past, 1),
    TOLIQ: await sozHolati('TOLIQ', lexemeSoni, future, 3),
    QISMAN: await sozHolati('QISMAN', 60, future, 1),
    YANGI: await sozHolati('YANGI', Math.min(320, lexemeSoni), future, 1),
  };

  // Streaks: one attempt per day back from today, same rule as the writer
  // (Tashkent day of createdAt, sealed group), then the day totals follow.
  const seriya = async (nomi: KohortNomi, kunlar: number) =>
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "DafAttempt"
        ("studentId", "companyId", "groupId", "isCorrect", "given", "points", "sessionId", "createdAt")
      SELECT c.id, c."companyId", ${GROUP_OF}, true, '"x"'::jsonb, 10, ${SERI_SESSION},
             ${UTC_NOW} - d.n * interval '1 day' - interval '1 minute'
      FROM (${KOHORT_SQL}) c
      CROSS JOIN generate_series(0, ${kunlar - 1}) AS d(n)
      WHERE c.k = ANY(${ks(nomi)}::int[])`);
  const streak = {
    TOLIQ: await seriya('TOLIQ', 105),
    YANGI: await seriya('YANGI', 105),
    QISMAN: await seriya('QISMAN', 8),
  };
  await prisma.$executeRaw`
    INSERT INTO "DafStudentDay" ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
    SELECT "studentId", "companyId", ("createdAt" + interval '5 hours')::date,
           COALESCE("groupId", ''), SUM(points)::int, COUNT(*)::int, now()
    FROM "DafAttempt" WHERE "sessionId" = ${SERI_SESSION}
    GROUP BY 1, 2, 3, 4
    ON CONFLICT ("studentId", "day", "groupKey") DO UPDATE SET
      "points" = "DafStudentDay"."points" + EXCLUDED."points",
      "attempts" = "DafStudentDay"."attempts" + EXCLUDED."attempts",
      "updatedAt" = now()`;

  // Every lesson done: the "no open lesson" worst path of `bugunBoshmi`.
  await prisma.$executeRaw`DELETE FROM "DafLessonProgress"`;
  const tugagan = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DafLessonProgress" ("studentId", "lessonId", "completedAt", "bestScore", "runs", "companyId")
    SELECT c.id, l.id, ${UTC_NOW}, 10, 1, c."companyId"
    FROM (${KOHORT_SQL}) c
    CROSS JOIN "DafLesson" l
    JOIN "DafUnit" u ON u.id = l."unitId"
    WHERE c.k = ANY(${ks('TUGAGAN')}::int[])
      AND u."retiredAt" IS NULL
      AND (l."sectionId" IS NOT NULL OR l.kind = 'UNIT_TEST')
      AND EXISTS (
        SELECT 1 FROM "DafLexeme" x
        WHERE x."unitId" = u.id AND x.core AND x."sectionId" IS NOT NULL)
    ON CONFLICT DO NOTHING`);

  // Steady state: the one-time grant has run for TOLIQ and QISMAN, so every
  // session end of theirs is an INSERT whose rows all conflict.
  const idlar = async (nomi: KohortNomi) =>
    prisma.$queryRaw<{ id: number; companyId: number }[]>(
      Prisma.sql`SELECT id, "companyId" FROM (${KOHORT_SQL}) c WHERE c.k = ANY(${ks(nomi)}::int[])`,
    );
  const bering = async (
    nomi: KohortNomi,
    sharoit: { serie: number; woerter: number },
  ) => {
    const list = await idlar(nomi);
    for (const s of list) {
      await grantBadges(prisma as any, s.id, s.companyId, sharoit);
    }
    return list.length;
  };
  const berildi = {
    TOLIQ: await bering('TOLIQ', { serie: 105, woerter: lexemeSoni }),
    QISMAN: await bering('QISMAN', { serie: 8, woerter: 60 }),
  };

  for (const t of [
    'DafStudentDay',
    'DafAttempt',
    'DafLexemeState',
    'DafStudentBadge',
    'DafLessonProgress',
    'DafStudentSetting',
  ]) {
    await prisma.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(`"${t}"`)}`);
  }

  // Sanity: the cohorts behave as named.
  const [ochiq] = await idlar('OCHIQ');
  const [tug] = await idlar('TUGAGAN');
  const boshOchiq = await bugunBoshmi(prisma as any, ochiq.id, 0);
  const boshTugagan = await bugunBoshmi(prisma as any, tug.id, 0);

  const diff = await prisma.$queryRaw<unknown[]>(DIFF_SQL);
  console.log({
    sozlama,
    lexemeSoni,
    states,
    streak,
    tugagan,
    berildi,
    boshOchiq,
    boshTugagan,
    diff: diff.length,
  });
  if (diff.length > 0 || boshOchiq !== false || boshTugagan !== true) {
    process.exitCode = 1;
  }
});

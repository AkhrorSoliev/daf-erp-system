/**
 * LOCAL ONLY. p50 / p95 of the S1 and S2 reads and the writer, 50 students at
 * once, 10 rounds (S1 spec §6, S2 spec §8). Exits 1 when a p95 limit is
 * crossed.
 *
 * Two blocks. The first is the S1 table over a random mix of students
 * (without the YANGI cohort, which is fresh only once) plus `nishonlar`. The
 * second splits the worst paths by cohort (`daf-yuklama-kohort.ts`):
 * `fortschritt` with due words / with none and an open lesson / with none and
 * no lesson left, and `seansNatijasi` with no badge to give / all badge rows
 * conflicting / some conflicting / every row new.
 */
import { randomUUID } from 'crypto';
import { loadavg } from 'os';
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { FortschrittService } from '../../src/daf/fortschritt/fortschritt.service';
import { recordAttempt } from '../../src/daf/shared/attempt-writer';
import { grantBadges } from '../../src/daf/nishon/nishon-berish';
import { NISHON_KATALOGI } from '../../src/daf/nishon/nishon-katalogi';
import {
  GROUP_OF,
  KOHORT,
  KOHORT_SQL,
  kohortOl,
  type KohortNomi,
  type KohortStudent,
} from './daf-yuklama-kohort';

assertLocalDb();

const PARALLEL = 50;
const ROUNDS = 10;
const LIMIT: Record<string, number> = {
  fortschritt: 200,
  'reyting zentrum': 200,
  'reyting gruppe': 200,
  recordAttempt: 200,
  seansNatijasi: 300,
  nishonlar: 200,
};

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))
  ];

interface Row {
  name: string;
  n: number;
  p50: number;
  p95: number;
  limit: number;
  ok: boolean;
}

const row = (name: string, xs: number[], limit: number): Row => ({
  name,
  n: xs.length,
  p50: Math.round(pct(xs, 50)),
  p95: Math.round(pct(xs, 95)),
  limit,
  ok: pct(xs, 95) < limit,
});

run(async (prisma) => {
  const svc = new FortschrittService(prisma as any);
  const load0 = loadavg();
  console.log('load average before', load0.map((x) => x.toFixed(2)).join(' '));

  const students = await prisma.$queryRaw<KohortStudent[]>(Prisma.sql`
    SELECT c.id, c."companyId", ${GROUP_OF} AS "groupId"
    FROM (${KOHORT_SQL}) c
    WHERE c.k <> ALL(${[...KOHORT.YANGI]}::int[])
    ORDER BY random() LIMIT ${PARALLEL}`);

  // S2: every other student has chosen a goal, so the setting CTE reads rows.
  await prisma.$executeRaw`
    INSERT INTO "DafStudentSetting" ("studentId", "companyId", "dailyGoal", "updatedAt")
    SELECT id, "companyId", 'JIDDIY', now() FROM "Student"
    WHERE "deletedAt" IS NULL AND id % 2 = 0
    ON CONFLICT ("studentId") DO NOTHING`;

  const samples: Record<string, number[]> = Object.fromEntries(
    Object.keys(LIMIT).map((k) => [k, []]),
  );
  for (let round = 0; round < ROUNDS; round += 1) {
    const sessionId = randomUUID();
    for (const [name, op] of [
      [
        'fortschritt',
        (s: (typeof students)[0]) => svc.uebersicht(s.id, s.companyId),
      ],
      [
        'reyting zentrum',
        (s: (typeof students)[0]) => svc.reyting(s.id, s.companyId, 'zentrum'),
      ],
      [
        'reyting gruppe',
        (s: (typeof students)[0]) => svc.reyting(s.id, s.companyId, 'gruppe'),
      ],
      [
        'recordAttempt',
        (s: (typeof students)[0]) =>
          recordAttempt(prisma as any, {
            studentId: s.id,
            companyId: s.companyId,
            groupId: s.groupId,
            isCorrect: true,
            given: 'x',
            points: 10,
            sessionId,
          }),
      ],
      [
        'seansNatijasi',
        (s: (typeof students)[0]) =>
          svc.seansNatijasi(sessionId, s.id, s.companyId),
      ],
      ['nishonlar', (s: (typeof students)[0]) => svc.nishonlar(s.id)],
    ] as const) {
      const ms = await Promise.all(students.map((s) => timed(() => op(s))));
      samples[name].push(...ms);
    }
  }

  const table = Object.entries(samples).map(([name, xs]) =>
    row(name, xs, LIMIT[name]),
  );
  console.table(table);

  // ---- Cohort block: the worst paths one by one. ----
  /** One scenario: `rounds` rounds of 50 students; `prep` runs untimed first. */
  const kohortOlchov = async (
    name: string,
    limit: number,
    nomi: KohortNomi,
    op: (s: KohortStudent, sessionId: string) => Promise<unknown>,
    opts: { prep?: boolean; fresh?: boolean } = {},
  ): Promise<Row> => {
    const xs: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const group = await kohortOl(prisma, nomi, PARALLEL, opts.fresh);
      if (group.length === 0) break;
      const sessionId = randomUUID();
      if (opts.prep) {
        await Promise.all(
          group.map((s) =>
            recordAttempt(prisma as any, {
              studentId: s.id,
              companyId: s.companyId,
              groupId: s.groupId,
              isCorrect: true,
              given: 'x',
              points: 10,
              sessionId,
            }),
          ),
        );
      }
      xs.push(
        ...(await Promise.all(group.map((s) => timed(() => op(s, sessionId))))),
      );
    }
    return row(name, xs, limit);
  };
  const uebersicht = (s: KohortStudent) => svc.uebersicht(s.id, s.companyId);
  const seans = (s: KohortStudent, sessionId: string) =>
    svc.seansNatijasi(sessionId, s.id, s.companyId);

  const cohortTable: Row[] = [
    await kohortOlchov(
      'fortschritt · muddati kelgan so`z bor (DUE)',
      LIMIT.fortschritt,
      'DUE',
      uebersicht,
    ),
    await kohortOlchov(
      'fortschritt · 0 so`z, ochiq dars bor (OCHIQ)',
      LIMIT.fortschritt,
      'OCHIQ',
      uebersicht,
    ),
    await kohortOlchov(
      'fortschritt · 0 so`z, dars qolmagan (TUGAGAN)',
      LIMIT.fortschritt,
      'TUGAGAN',
      uebersicht,
    ),
    await kohortOlchov(
      'seansNatijasi · berish uchun nishon yo`q (OCHIQ)',
      LIMIT.seansNatijasi,
      'OCHIQ',
      seans,
      { prep: true },
    ),
    await kohortOlchov(
      'seansNatijasi · INSERT, hamma qator konflikt (TOLIQ)',
      LIMIT.seansNatijasi,
      'TOLIQ',
      seans,
      { prep: true },
    ),
    await kohortOlchov(
      'seansNatijasi · INSERT, 3 qator konflikt (QISMAN)',
      LIMIT.seansNatijasi,
      'QISMAN',
      seans,
      { prep: true },
    ),
    await kohortOlchov(
      'seansNatijasi · INSERT, hamma qator yangi (YANGI)',
      LIMIT.seansNatijasi,
      'YANGI',
      seans,
      { prep: true, fresh: true },
    ),
    await kohortOlchov(
      'nishonlar · 105 kunlik seriya, 10 nishon (TOLIQ)',
      LIMIT.nishonlar,
      'TOLIQ',
      (s) => svc.nishonlar(s.id),
    ),
  ];
  console.table(cohortTable);

  const plan = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
    EXPLAIN ANALYZE SELECT "studentId", SUM(points) FROM "DafStudentDay"
    WHERE "companyId" = ${students[0].companyId}
      AND day >= (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date
    GROUP BY 1`;
  console.log(plan.map((r) => r['QUERY PLAN']).join('\n'));

  // Same row, 50 writers at once: the ON CONFLICT increment must lose nothing.
  const one = students[0];
  const key = one.groupId ?? '';
  const readRow = async () =>
    (
      await prisma.$queryRaw<{ points: number; attempts: number }[]>`
        SELECT points, attempts FROM "DafStudentDay"
        WHERE "studentId" = ${one.id}
          AND day = ((now() AT TIME ZONE 'UTC') + interval '5 hours')::date
          AND "groupKey" = ${key}`
    )[0] ?? { points: 0, attempts: 0 };
  const before = await readRow();
  await Promise.all(
    Array.from({ length: PARALLEL }, (_, i) =>
      recordAttempt(prisma as any, {
        studentId: one.id,
        companyId: one.companyId,
        groupId: one.groupId,
        isCorrect: true,
        given: 'x',
        points: i + 1,
        sessionId: randomUUID(),
      }),
    ),
  );
  const after = await readRow();
  const same = {
    expectedPoints: before.points + (PARALLEL * (PARALLEL + 1)) / 2,
    actualPoints: after.points,
    expectedAttempts: before.attempts + PARALLEL,
    actualAttempts: after.attempts,
  };
  const sameOk =
    same.expectedPoints === same.actualPoints &&
    same.expectedAttempts === same.actualAttempts;
  console.log('same-row concurrency', same, sameOk ? 'OK' : 'FAIL');

  // S2: 50 grants at once for one student — each key is "new" exactly once.
  // A student of the OCHIQ cohort, so no cohort the table needs is used up.
  const [who] = await kohortOl(prisma, 'OCHIQ', 1);
  const bor = await prisma.dafStudentBadge.count({
    where: { studentId: who.id },
  });
  const berildi = (
    await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        grantBadges(prisma as any, who.id, who.companyId, {
          serie: 100,
          woerter: 592,
        }),
      ),
    )
  ).flat();
  const jami = await prisma.dafStudentBadge.count({
    where: { studentId: who.id },
  });
  const badgeOk =
    berildi.length === NISHON_KATALOGI.length - bor &&
    new Set(berildi).size === berildi.length &&
    jami === NISHON_KATALOGI.length;
  console.log(
    'badge concurrency',
    { bor, berildi: berildi.length, jami },
    badgeOk ? 'OK' : 'FAIL',
  );

  console.log(
    'load average after',
    loadavg()
      .map((x) => x.toFixed(2))
      .join(' '),
  );
  if (
    table.some((r) => !r.ok) ||
    cohortTable.some((r) => !r.ok) ||
    !sameOk ||
    !badgeOk
  )
    process.exitCode = 1;
});

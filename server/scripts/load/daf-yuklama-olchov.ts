/**
 * LOCAL ONLY. p50 / p95 of the S1 reads and the writer, 50 students at once,
 * 10 rounds (spec §6). Exits 1 when a p95 limit is crossed.
 */
import { randomUUID } from 'crypto';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { FortschrittService } from '../../src/daf/fortschritt/fortschritt.service';
import { recordAttempt } from '../../src/daf/shared/attempt-writer';

assertLocalDb();

const PARALLEL = 50;
const ROUNDS = 10;
const LIMIT: Record<string, number> = {
  fortschritt: 200,
  'reyting zentrum': 200,
  'reyting gruppe': 200,
  recordAttempt: 200,
  seansNatijasi: 300,
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

run(async (prisma) => {
  const svc = new FortschrittService(prisma as any);
  const students = await prisma.$queryRaw<
    { id: number; companyId: number; groupId: string | null }[]
  >`
    SELECT s.id, s."companyId",
           (SELECT "groupId" FROM "Enrollment" e WHERE e."studentId" = s.id AND e.status = 'ACTIVE'
            ORDER BY e."createdAt" DESC LIMIT 1) AS "groupId"
    FROM (SELECT id, "companyId" FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 5000) s
    ORDER BY random() LIMIT ${PARALLEL}`;

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
    ] as const) {
      const ms = await Promise.all(students.map((s) => timed(() => op(s))));
      samples[name].push(...ms);
    }
  }

  const table = Object.entries(samples).map(([name, xs]) => ({
    name,
    p50: Math.round(pct(xs, 50)),
    p95: Math.round(pct(xs, 95)),
    limit: LIMIT[name],
    ok: pct(xs, 95) < LIMIT[name],
  }));
  console.table(table);

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

  if (table.some((r) => !r.ok) || !sameOk) process.exitCode = 1;
});

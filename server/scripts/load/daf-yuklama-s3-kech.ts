/**
 * LOCAL ONLY. S3 week settlement under concurrent work (spec S3 §10, Task 10
 * review items). Needs the state `daf-yuklama-s3-seed.ts` leaves: last week's
 * rooms NOT yet settled. One scenario per run (`MODE`). On its first run it
 * snapshots the seeded tiers and badges into `_bak_tier` / `_bak_badge` (kept;
 * `IF NOT EXISTS`); between runs the DB is put back by hand with
 * `daf-yuklama-s3-tiklash.sql` (same folder), which reads those snapshots:
 *
 *  count    — one `settleDue` on a client that logs every statement: wall
 *             time and the statements by their `/* tag *\/` (a per-student
 *             round trip would show as thousands of one tag).
 *  stall    — one `settleDue` (waits for the lock) while 40 room-less students
 *             `joinRoom` and a probe reads `liga` / `uebersicht`: how long each
 *             waits, what fails, and what a read costs while the pool is held.
 *             With `HELD=1` nobody settles: another session holds the company
 *             lock (`pg_advisory_xact_lock` + `pg_sleep` in psql) — a settle
 *             that takes longer than `joinRoom`'s 10 s transaction budget.
 *  kech1    — the first session end after a missed Monday settle: one
 *             `seansNatijasi` runs `settleDue`, then `joinRoom`.
 *  kech50   — 50 session ends at the same moment (Monday 00:00–00:05).
 *  parallel — 50 `settleDue` at once, session-end style (no waiting): exactly
 *             one settles; tiers rose at most once.
 *
 * Writes only through `joinRoom` / `settleDue` / `recordAttempt`.
 */
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { makePrisma, run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { kohortOl } from './daf-yuklama-kohort';
import { FortschrittService } from '../../src/daf/fortschritt/fortschritt.service';
import { recordAttempt } from '../../src/daf/shared/attempt-writer';
import { settleDue } from '../../src/daf/liga/liga-hisob';
import { joinRoom, LIGA_HISOB_KALIT } from '../../src/daf/liga/liga-xona';

assertLocalDb();

const MODE = process.argv[2] ?? '';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))
  ];
const sum = (xs: number[]) => ({
  n: xs.length,
  p50: Math.round(pct(xs, 50)),
  p95: Math.round(pct(xs, 95)),
  max: Math.round(Math.max(...xs)),
});

/** `performance.now()` of the call, whatever it returns or throws. */
async function timed<T>(fn: () => Promise<T>) {
  const t = performance.now();
  try {
    const value = await fn();
    return { ms: performance.now() - t, value, error: null as string | null };
  } catch (e) {
    return {
      ms: performance.now() - t,
      value: null as T | null,
      error: (e as Error).message.split('\n').pop()!,
    };
  }
}

run(async (prisma) => {
  const mon = makePrisma(); // own pool: watching must not wait on the busy one
  try {
    const svc = new FortschrittService(prisma as any);
    const jetzt = new Date();
    const { companyId } = await prisma.dafLeagueRoom.findFirstOrThrow({
      where: { settledAt: null },
    });
    const settled = () =>
      mon.dafLeagueRoom.count({ where: { settledAt: { not: null } } });
    if ((await settled()) > 0)
      throw new Error(
        'Hafta allaqachon hisoblangan: bazani tiklang (daf-yuklama-s3-tiklash.sql).',
      );
    await mon.$executeRaw`CREATE TABLE IF NOT EXISTS _bak_tier AS SELECT "studentId", tier FROM "DafStudentLeague"`;
    await mon.$executeRaw`CREATE TABLE IF NOT EXISTS _bak_badge AS SELECT id FROM "DafStudentBadge"`;

    if (MODE === 'count') {
      const counted = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
        log: [{ emit: 'event', level: 'query' }],
      });
      const tags = new Map<string, number>();
      let total = 0;
      counted.$on('query', (e: { query: string }) => {
        total += 1;
        const tag =
          /^\s*\/\*\s*([^*]+?)\s*\*\//.exec(e.query)?.[1] ??
          e.query.trim().split(/\s+/)[0];
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      });
      await counted.$connect();
      const r = await timed(() =>
        settleDue(counted as any, companyId, jetzt, { kutish: true }),
      );
      await counted.$disconnect();
      console.log(
        JSON.stringify(
          {
            mode: MODE,
            ms: Math.round(r.ms),
            error: r.error,
            results: r.value,
            statements: total,
            byTag: Object.fromEntries([...tags].sort((a, b) => b[1] - a[1])),
          },
          null,
          1,
        ),
      );
      return;
    }

    if (MODE === 'stall') {
      const joiners = await kohortOl(prisma, 'TUGAGAN', 40, false, true);
      const probes = await kohortOl(prisma, 'DUE', 8, false, false);
      const t0 = performance.now();
      const held = (): Promise<number> =>
        mon
          .$queryRaw<{ n: number }[]>(
            Prisma.sql`
          SELECT COUNT(*)::int AS n FROM pg_locks
          WHERE locktype = 'advisory' AND granted AND mode = 'ExclusiveLock' AND classid = ${LIGA_HISOB_KALIT}`,
          )
          .then((r) => r[0].n);
      const settle = process.env.HELD
        ? timed(async () => {
            while ((await held()) === 0) await delay(10);
            while ((await held()) > 0) await delay(50);
          })
        : timed(() =>
            settleDue(prisma as any, companyId, jetzt, { kutish: true }),
          );
      // Wait until the settle really holds its exclusive company lock.
      let lockAt = -1;
      for (let i = 0; i < 400 && lockAt < 0; i += 1) {
        const [l] = await mon.$queryRaw<{ n: number }[]>(Prisma.sql`
          SELECT COUNT(*)::int AS n FROM pg_locks
          WHERE locktype = 'advisory' AND granted AND mode = 'ExclusiveLock' AND classid = ${LIGA_HISOB_KALIT}`);
        if (l.n > 0) lockAt = performance.now() - t0;
        else await delay(10);
      }
      const joins = joiners.map((s) =>
        timed(() => joinRoom(prisma as any, s.id, s.companyId, new Date())),
      );
      // A probe every 400 ms until the settle ends: a read each, from a student with a room.
      const reads: {
        at: number;
        what: string;
        ms: number;
        error: string | null;
      }[] = [];
      let done = false;
      settle.then(() => (done = true));
      const probeLoop = (async () => {
        while (!done) {
          const at = performance.now() - t0;
          const s = probes[reads.length % probes.length];
          const r = await Promise.all([
            timed(() => svc.liga(s.id)),
            timed(() => svc.uebersicht(s.id, s.companyId)),
          ]);
          reads.push({ at, what: 'liga', ms: r[0].ms, error: r[0].error });
          reads.push({
            at,
            what: 'uebersicht',
            ms: r[1].ms,
            error: r[1].error,
          });
          await delay(400);
        }
      })();
      const [settleR, joinR] = await Promise.all([
        settle,
        Promise.all(joins),
        probeLoop,
      ]);
      const ok = joinR.filter((j) => !j.error);
      const [{ n: qoshildi }] = await mon.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS n FROM "DafLeagueEntry" e
        WHERE e."studentId" = ANY(${joiners.map((j) => j.id)}::int[])
          AND e."weekStart" = (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date`);
      console.log(
        JSON.stringify(
          {
            mode: MODE,
            settleMs: Math.round(settleR.ms),
            settleError: settleR.error,
            lockAtMs: Math.round(lockAt),
            joins: {
              ...sum(joinR.map((j) => j.ms)),
              ok: ok.length,
              failed: joinR.length - ok.length,
              joinedInDb: qoshildi,
            },
            joinErrors: [
              ...new Set(joinR.filter((j) => j.error).map((j) => j.error)),
            ],
            reads: sum(reads.map((r) => r.ms)),
            readsOver1s: reads.filter((r) => r.ms > 1000).length,
            readErrors: reads.filter((r) => r.error).length,
            readsDuringSettle: reads.length,
          },
          null,
          1,
        ),
      );
      return;
    }

    if (MODE === 'kech1' || MODE === 'kech50') {
      const n = MODE === 'kech1' ? 1 : 50;
      const batch = await kohortOl(prisma, 'TUGAGAN', n, false, true);
      const sessionId = randomUUID();
      await Promise.all(
        batch.map((s) =>
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
      const t0 = performance.now();
      const calls = await Promise.all(
        batch.map((s) =>
          timed(() => svc.seansNatijasi(sessionId, s.id, s.companyId)),
        ),
      );
      const wall = performance.now() - t0;
      const [{ n: qoshildi }] = await mon.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS n FROM "DafLeagueEntry" e
        WHERE e."studentId" = ANY(${batch.map((j) => j.id)}::int[])
          AND e."weekStart" = (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date`);
      console.log(
        JSON.stringify(
          {
            mode: MODE,
            students: n,
            wallMs: Math.round(wall),
            sessionEnd: sum(calls.map((c) => c.ms)),
            errors: calls.filter((c) => c.error).length,
            weekSettledAfter: (await settled()) > 0,
            joinedInDb: qoshildi,
          },
          null,
          1,
        ),
      );
      return;
    }

    if (MODE === 'parallel') {
      const t0 = performance.now();
      const calls = await Promise.all(
        Array.from({ length: 50 }, () =>
          timed(() =>
            settleDue(prisma as any, companyId, jetzt, { kutish: false }),
          ),
        ),
      );
      const wall = performance.now() - t0;
      const res = calls.flatMap((c) => c.value ?? []);
      const [tek] = await mon.$queryRaw<
        {
          tushdi: number;
          ikki: number;
          oshdi: number;
          xona: number;
          hisoblangan: number;
        }[]
      >(Prisma.sql`
        SELECT
          (SELECT COUNT(*)::int FROM "DafStudentLeague" s JOIN _bak_tier b USING ("studentId") WHERE s.tier < b.tier) AS tushdi,
          (SELECT COUNT(*)::int FROM "DafStudentLeague" s JOIN _bak_tier b USING ("studentId") WHERE s.tier > b.tier + 1) AS ikki,
          (SELECT COUNT(*)::int FROM "DafStudentLeague" s JOIN _bak_tier b USING ("studentId") WHERE s.tier > b.tier) AS oshdi,
          (SELECT COUNT(*)::int FROM "DafLeagueRoom" WHERE "settledAt" IS NOT NULL) AS xona,
          (SELECT COUNT(*)::int FROM "DafLeagueEntry" WHERE place IS NOT NULL) AS hisoblangan`);
      const [kotar] = await mon.$queryRaw<{ n: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS n FROM "DafLeagueEntry" WHERE promoted`,
      );
      console.log(
        JSON.stringify(
          {
            mode: MODE,
            wallMs: Math.round(wall),
            errors: calls.filter((c) => c.error).map((c) => c.error),
            calls: sum(calls.map((c) => c.ms)),
            bajarildiFalse: res.filter((r) => !r.bajarildi).length,
            settlers: res.filter((r) => r.xonalar > 0).length,
            xonalarJami: res.reduce((a, r) => a + r.xonalar, 0),
            kotarildiJami: res.reduce((a, r) => a + r.kotarildi, 0),
            guruhlarJami: res.reduce((a, r) => a + r.guruhlar, 0),
            db: { ...tek, promotedRows: kotar.n },
          },
          null,
          1,
        ),
      );
      return;
    }
    throw new Error('MODE: count | stall | kech1 | kech50 | parallel');
  } finally {
    await mon.$disconnect();
  }
});

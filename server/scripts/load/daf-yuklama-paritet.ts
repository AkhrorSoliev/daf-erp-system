/**
 * LOCAL ONLY. The centre ranking moved into SQL (`FortschrittService`
 * `zentrumHaftaCte`); this checks it against the OLD algorithm on the
 * load-test database: the week's raw `DafStudentDay` rows summed per student
 * in JS, the caller added with 0 when absent, sorted points DESC then
 * studentId ASC, TOP 50 + own row with its real place.
 *
 * ~200 students: random ones with rows, the top of the table, and students
 * with no row this week. Most get a synthetic session (1–3 attempts through
 * `recordAttempt`) so `seansNatijasi`'s "oldin" differs from "hozir".
 * Compared: `reyting('zentrum')` rows (studentId, platz, punkte),
 * `uebersicht().wochePunkte / wochePlatzZentrum`, `seansNatijasi().orin.zentrum`.
 * Exits 1 on any mismatch. Writes ~400 attempts (throwaway DB only).
 */
import { randomUUID } from 'crypto';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { FortschrittService } from '../../src/daf/fortschritt/fortschritt.service';
import { recordAttempt } from '../../src/daf/shared/attempt-writer';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../src/common/date/tashkent';
import { wochenStartTag } from '../../src/daf/uebung/punkte';

assertLocalDb();

type Sample = {
  id: number;
  companyId: number;
  groupId: string | null;
  sessionId: string;
  minus: number;
};

const shuffle = <T>(xs: T[]) =>
  xs
    .map((x) => ({ x, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map((p) => p.x);

/** Old algorithm: rank the whole list in JS. */
function sorted(totals: Map<number, number>, me: number, mePoints?: number) {
  const list = new Map(totals);
  if (!list.has(me)) list.set(me, 0);
  if (mePoints !== undefined) list.set(me, mePoints);
  return [...list].sort(([a, pa], [b, pb]) => pb - pa || a - b);
}

run(async (prisma) => {
  const svc = new FortschrittService(prisma as any);
  const companyId = (
    await prisma.$queryRaw<{ companyId: number }[]>`
      SELECT "companyId" FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 1`
  )[0].companyId;
  const montag = utcMidnightFromDateStr(wochenStartTag(new Date()));

  const weekRows = () =>
    prisma.dafStudentDay.findMany({
      where: { companyId, day: { gte: montag } },
      select: { studentId: true, points: true },
    });
  const totalsOf = (rows: { studentId: number; points: number }[]) => {
    const m = new Map<number, number>();
    for (const r of rows)
      m.set(r.studentId, (m.get(r.studentId) ?? 0) + r.points);
    return m;
  };

  const before = [...totalsOf(await weekRows())].sort(
    ([a, pa], [b, pb]) => pb - pa || a - b,
  );
  const withRows = new Set(before.map(([id]) => id));
  const top = before.slice(0, 60).map(([id]) => id);
  const rest = shuffle(before.slice(60).map(([id]) => id)).slice(0, 150);
  const noRows = (
    await prisma.student.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'desc' },
      take: 500,
    })
  )
    .map((s) => s.id)
    .filter((id) => !withRows.has(id))
    .slice(0, 30);

  const ids = [...shuffle(top).slice(0, 20), ...rest, ...noRows];
  const groups = await prisma.$queryRaw<
    { id: number; groupId: string | null }[]
  >`
    SELECT s.id,
           (SELECT "groupId" FROM "Enrollment" e WHERE e."studentId" = s.id AND e.status = 'ACTIVE'
            ORDER BY e."createdAt" DESC LIMIT 1) AS "groupId"
    FROM "Student" s WHERE s.id = ANY(${ids})`;
  const groupOf = new Map(groups.map((g) => [g.id, g.groupId]));

  // Synthetic sessions for students that already have rows; the no-row ones
  // stay absent (oldin = hozir, own row added with 0).
  const samples: Sample[] = [];
  for (const id of ids) {
    const s: Sample = {
      id,
      companyId,
      groupId: groupOf.get(id) ?? null,
      sessionId: randomUUID(),
      minus: 0,
    };
    if (withRows.has(id)) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i += 1) {
        const points = Math.floor(Math.random() * 300);
        await recordAttempt(prisma as any, {
          studentId: id,
          companyId,
          groupId: s.groupId,
          isCorrect: true,
          given: 'x',
          points,
          sessionId: s.sessionId,
        });
        s.minus += points;
      }
    }
    samples.push(s);
  }

  const totals = totalsOf(await weekRows());
  const mismatches: string[] = [];
  const check = (who: number, what: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      mismatches.push(
        `${who} ${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`,
      );
  };

  for (const s of samples) {
    const list = sorted(totals, s.id);
    const place = (l: [number, number][]) =>
      l.findIndex(([id]) => id === s.id) + 1;
    const own = list[place(list) - 1][1];
    const ranked = list.map(([studentId, punkte], i) => ({
      studentId,
      platz: i + 1,
      punkte,
    }));
    const wantRows = ranked.slice(0, 50);
    if (!wantRows.some((r) => r.studentId === s.id))
      wantRows.push(ranked[place(list) - 1]);

    const rows = await svc.reyting(s.id, s.companyId, 'zentrum');
    check(
      s.id,
      'reyting',
      rows.map((r) => [r.studentId, r.platz, r.punkte]),
      wantRows.map((r) => [r.studentId, r.platz, r.punkte]),
    );

    const f = await svc.uebersicht(s.id, s.companyId);
    check(s.id, 'wochePunkte', f.wochePunkte, own);
    check(s.id, 'wochePlatzZentrum', f.wochePlatzZentrum, place(list));

    const n = await svc.seansNatijasi(s.sessionId, s.id, s.companyId);
    const oldin = place(sorted(totals, s.id, Math.max(0, own - s.minus)));
    check(s.id, 'seans.zentrum', n.orin.zentrum, {
      oldin,
      hozir: place(list),
    });
  }

  // An absent caller among zero-point rows must slot in by id. Nobody on
  // this DB has a 0-point week, so two are added in a transaction that is
  // rolled back.
  const [b, a, c] = [...noRows].sort((x, y) => x - y);
  class Rollback extends Error {}
  await prisma
    .$transaction(async (tx) => {
      await tx.dafStudentDay.createMany({
        data: [b, c].map((studentId) => ({
          studentId,
          companyId,
          day: utcMidnightFromDateStr(tashkentDateStr(new Date())),
          groupKey: '',
          points: 0,
          attempts: 1,
        })),
      });
      const t = new FortschrittService(tx as any);
      const zero = new Map([...totals, [b, 0], [c, 0]]);
      for (const who of [a, c]) {
        const want = sorted(zero, who).findIndex(([id]) => id === who) + 1;
        const rows = await t.reyting(who, companyId, 'zentrum');
        check(who, 'zero-tie reyting', rows[rows.length - 1].platz, want);
        const f = await t.uebersicht(who, companyId);
        check(who, 'zero-tie uebersicht', f.wochePlatzZentrum, want);
      }
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });

  const moved = samples.filter((s) => s.minus > 0).length;
  console.log({
    students: samples.length,
    withSession: moved,
    noWeekRow: noRows.length,
    weekStudents: totals.size,
    mismatches: mismatches.length,
  });
  for (const m of mismatches.slice(0, 20)) console.log(m);
  if (mismatches.length > 0) process.exitCode = 1;
});

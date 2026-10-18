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
 *
 * S2: the same students also check the daily goal against a brute-force read.
 * Today's points = the sum of `DafAttempt.points` created on today's Tashkent
 * day over ALL groups (about a third of the students also answer in a second
 * group today, so a per-group read would show). The goal = the student's
 * `DafStudentSetting` row, `ORTA` when there is none; the sample takes
 * students with a JIDDIY row, a YENGIL row and no row. `bosh` is recomputed
 * with its own SQL. Compared: `uebersicht().maqsad` and `seansNatijasi().maqsad`.
 * Exits 1 on any mismatch. Writes ~500 attempts (throwaway DB only).
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
import {
  MAQSAD_BALL,
  serieAus,
  wochenStartTag,
} from '../../src/daf/uebung/punkte';
import { Prisma } from '@prisma/client';

assertLocalDb();

type Sample = {
  id: number;
  companyId: number;
  groupId: string | null;
  sessionId: string;
  minus: number;
  attempts: number;
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

  // S2: students of every goal state that already have week rows, so the goal
  // CTE reads a JIDDIY row, a YENGIL row and no row at all.
  const goalSample = async (cond: Prisma.Sql) =>
    (
      await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
        SELECT s.id FROM "Student" s
        LEFT JOIN "DafStudentSetting" g ON g."studentId" = s.id
        WHERE s.id = ANY(${[...withRows]}::int[]) AND ${cond}
        ORDER BY random() LIMIT 15`)
    ).map((r) => r.id);
  const goalIds = [
    ...(await goalSample(Prisma.sql`g."dailyGoal" = 'JIDDIY'`)),
    ...(await goalSample(Prisma.sql`g."dailyGoal" = 'YENGIL'`)),
    ...(await goalSample(Prisma.sql`g."studentId" IS NULL`)),
  ];

  const ids = [
    ...new Set([...shuffle(top).slice(0, 20), ...rest, ...goalIds, ...noRows]),
  ];
  const groups = await prisma.$queryRaw<
    { id: number; groupId: string | null }[]
  >`
    SELECT s.id,
           (SELECT "groupId" FROM "Enrollment" e WHERE e."studentId" = s.id AND e.status = 'ACTIVE'
            ORDER BY e."createdAt" DESC LIMIT 1) AS "groupId"
    FROM "Student" s WHERE s.id = ANY(${ids})`;
  const groupOf = new Map(groups.map((g) => [g.id, g.groupId]));

  // Synthetic sessions for students that already have rows; the no-row ones
  // stay absent (oldin = hozir, own row added with 0). Every third one also
  // answers in a SECOND group today.
  const otherGroups = (
    await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Group" LIMIT 100`
  ).map((g) => g.id);
  const samples: Sample[] = [];
  let twoGroups = 0;
  for (const [index, id] of ids.entries()) {
    const s: Sample = {
      id,
      companyId,
      groupId: groupOf.get(id) ?? null,
      sessionId: randomUUID(),
      minus: 0,
      attempts: 0,
    };
    if (withRows.has(id)) {
      const second =
        index % 3 === 0
          ? (otherGroups.find((g) => g !== s.groupId) ?? null)
          : undefined;
      if (second !== undefined) twoGroups += 1;
      const n = (second !== undefined ? 2 : 1) + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i += 1) {
        const points = Math.floor(Math.random() * 300);
        await recordAttempt(prisma as any, {
          studentId: id,
          companyId,
          groupId: second !== undefined && i % 2 === 1 ? second : s.groupId,
          isCorrect: true,
          given: 'x',
          points,
          sessionId: s.sessionId,
        });
        s.minus += points;
        s.attempts += 1;
      }
    }
    samples.push(s);
  }

  // `bosh` recomputed with its own SQL (no `maqsad.ts`): no word due and no
  // ready lesson left undone.
  const boshOf = async (id: number) =>
    (
      await prisma.$queryRaw<{ bosh: boolean }[]>`
        SELECT (NOT EXISTS (
                  SELECT 1 FROM "DafLexemeState"
                  WHERE "studentId" = ${id} AND "dueAt" <= (now() AT TIME ZONE 'UTC'))
                AND NOT EXISTS (
                  SELECT 1 FROM "DafLesson" l JOIN "DafUnit" u ON u.id = l."unitId"
                  WHERE u."retiredAt" IS NULL
                    AND EXISTS (SELECT 1 FROM "DafLexeme" x
                                WHERE x."unitId" = u.id AND x.core AND x."sectionId" IS NOT NULL)
                    AND (l."sectionId" IS NOT NULL OR l.kind = 'UNIT_TEST')
                    AND NOT EXISTS (SELECT 1 FROM "DafLessonProgress" p
                                    WHERE p."lessonId" = l.id AND p."studentId" = ${id}
                                      AND p."completedAt" IS NOT NULL))
               ) AS bosh`
    )[0].bosh;
  const stats = { groupOnlyDiffers: 0, bosh: 0, yangiBajarildi: 0 };
  const goalCounts = { JIDDIY: 0, YENGIL: 0, ORTA: 0, qatorYoq: 0 };

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
    // Lifetime total and streak, the old Prisma reads.
    const heute = tashkentDateStr(new Date());
    const [jamiy, kunlar, bugun] = await Promise.all([
      prisma.dafStudentDay.aggregate({
        where: { studentId: s.id },
        _sum: { points: true },
      }),
      prisma.dafStudentDay.findMany({
        where: { studentId: s.id, attempts: { gt: 0 } },
        select: { day: true },
        distinct: ['day'],
      }),
      prisma.dafStudentDay.aggregate({
        where: { studentId: s.id, day: utcMidnightFromDateStr(heute) },
        _sum: { attempts: true },
      }),
    ]);
    const serie = serieAus(
      kunlar.map((k) => k.day.toISOString().slice(0, 10)),
      heute,
    );
    check(s.id, 'gesamt', f.gesamt, jamiy._sum.points ?? 0);
    check(s.id, 'serie', f.serie, serie);

    // S2: the daily goal against a brute-force read of DafAttempt (all groups).
    const bugunUrinishlar = (
      await prisma.dafAttempt.findMany({
        where: {
          studentId: s.id,
          createdAt: { gte: new Date(Date.now() - 36 * 3_600_000) },
        },
        select: { points: true, createdAt: true, groupId: true },
      })
    ).filter((u) => tashkentDateStr(u.createdAt) === heute);
    const bugunBall = bugunUrinishlar.reduce((sum, u) => sum + u.points, 0);
    // Proof the sample can tell the two reads apart: a per-group read of this
    // student would give another number.
    if (
      bugunBall !==
      bugunUrinishlar
        .filter((u) => u.groupId === s.groupId)
        .reduce((sum, u) => sum + u.points, 0)
    )
      stats.groupOnlyDiffers += 1;
    const sozlama = await prisma.dafStudentSetting.findUnique({
      where: { studentId: s.id },
    });
    const daraja = sozlama?.dailyGoal ?? 'ORTA';
    goalCounts[sozlama ? daraja : 'qatorYoq'] += 1;
    const ball = MAQSAD_BALL[daraja];
    const bosh = await boshOf(s.id);
    check(s.id, 'maqsad', f.maqsad, {
      daraja,
      ball,
      hozir: bugunBall,
      bajarildi: bosh || bugunBall >= ball,
      bosh,
    });

    const n = await svc.seansNatijasi(s.sessionId, s.id, s.companyId);
    const oldin = place(sorted(totals, s.id, Math.max(0, own - s.minus)));
    check(s.id, 'seans.serie', n.serie, serie);
    if (bosh) stats.bosh += 1;
    if (n.maqsad.yangiBajarildi) stats.yangiBajarildi += 1;
    check(s.id, 'seans.maqsad', n.maqsad, {
      ball,
      hozir: bugunBall,
      bajarildi: bugunBall >= ball,
      yangiBajarildi: bugunBall - s.minus < ball && ball <= bugunBall && !bosh,
    });
    // Every session attempt was written today, so it is today's first
    // practice exactly when today's attempts are the session's.
    check(
      s.id,
      'seans.serieYangi',
      n.serieYangi,
      s.attempts > 0 && (bugun._sum.attempts ?? 0) === s.attempts,
    );
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
    twoGroupsToday: twoGroups,
    goal: goalCounts,
    ...stats,
    weekStudents: totals.size,
    mismatches: mismatches.length,
  });
  for (const m of mismatches.slice(0, 20)) console.log(m);
  if (mismatches.length > 0) process.exitCode = 1;
});

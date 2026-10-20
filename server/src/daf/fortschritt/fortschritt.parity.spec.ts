import { FortschrittService } from './fortschritt.service';
import { kunlikKalit } from '../shared/attempt-writer';
import { serieAus, wochenStartUtc } from '../uebung/punkte';
import { tashkentDateStr } from '../../common/date/tashkent';
import { zentrumQueryRaw } from './zentrum-sql.fake-spec';

/**
 * The OLD formulas read DafAttempt directly; the service now reads the
 * day totals. Same attempts → same numbers. The day key comes from the
 * writer's own `kunlikKalit`, so a change to the bucketing rule shows here.
 */
type Urinish = {
  studentId: number;
  groupId: string | null;
  points: number;
  createdAt: Date;
};

const NOW = new Date('2026-10-19T09:00:00Z'); // Monday 14:00 Tashkent
const U: Urinish[] = [
  // Sunday 23:50 Tashkent — last week, must NOT count this week.
  {
    studentId: 7,
    groupId: 'g-1',
    points: 40,
    createdAt: new Date('2026-10-18T18:50:00Z'),
  },
  // Monday 00:10 Tashkent — this week.
  {
    studentId: 7,
    groupId: 'g-1',
    points: 20,
    createdAt: new Date('2026-10-18T19:10:00Z'),
  },
  {
    studentId: 55,
    groupId: 'g-1',
    points: 10,
    createdAt: new Date('2026-10-19T05:00:00Z'),
  },
  // Group changed mid-day: the points stay with the group they were earned in.
  {
    studentId: 55,
    groupId: 'g-2',
    points: 30,
    createdAt: new Date('2026-10-19T07:00:00Z'),
  },
  // No group.
  {
    studentId: 9,
    groupId: null,
    points: 30,
    createdAt: new Date('2026-10-19T08:00:00Z'),
  },
  // Streak days for 55: 17th and 18th (Tashkent).
  {
    studentId: 55,
    groupId: 'g-1',
    points: 0,
    createdAt: new Date('2026-10-17T06:00:00Z'),
  },
  {
    studentId: 55,
    groupId: 'g-1',
    points: 0,
    createdAt: new Date('2026-10-18T06:00:00Z'),
  },
];

type Row = {
  studentId: number;
  companyId: number;
  day: Date;
  groupKey: string;
  points: number;
  attempts: number;
};

function rows(): Row[] {
  const m = new Map<string, Row>();
  for (const u of U) {
    const { day, groupKey } = kunlikKalit(u.createdAt, u.groupId);
    const key = `${u.studentId}|${day}|${groupKey}`;
    const r = m.get(key) ?? {
      studentId: u.studentId,
      companyId: 1,
      day: new Date(`${day}T00:00:00.000Z`),
      groupKey,
      points: 0,
      attempts: 0,
    };
    r.points += u.points;
    r.attempts += 1;
    m.set(key, r);
  }
  return [...m.values()];
}

function matches(r: Row, where: any): boolean {
  if (where.studentId !== undefined && r.studentId !== where.studentId)
    return false;
  if (where.companyId !== undefined && r.companyId !== where.companyId)
    return false;
  if (where.groupKey !== undefined && r.groupKey !== where.groupKey)
    return false;
  if (where.day?.gte && r.day < where.day.gte) return false;
  if (where.attempts?.gt !== undefined && !(r.attempts > where.attempts.gt))
    return false;
  return true;
}

function fakeDayPrisma() {
  const data = rows();
  return {
    // The centre ranking runs in SQL; the fake sees the rows its WHERE would:
    // the company, from the Monday DATE the service binds.
    // The ranking, the total and the streak days run in SQL; the fake reads
    // the same day rows.
    $queryRaw: zentrumQueryRaw(() =>
      data.map((r) => ({ ...r, day: r.day.toISOString().slice(0, 10) })),
    ),
    dafStudentDay: {
      // Only the group table still uses groupBy.
      groupBy: jest.fn(async ({ where }: any) => {
        const sums = new Map<number, number>();
        for (const r of data.filter((x) => matches(x, where)))
          sums.set(r.studentId, (sums.get(r.studentId) ?? 0) + r.points);
        return [...sums].map(([studentId, points]) => ({
          studentId,
          _sum: { points },
        }));
      }),
    },
    enrollment: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.studentId === 55 ? { groupId: 'g-1' } : null,
      ),
      findMany: jest.fn(async () => [{ studentId: 7 }, { studentId: 55 }]),
    },
    student: {
      findMany: jest.fn(async () =>
        [7, 9, 55].map((id) => ({
          id,
          firstName: `S${id}`,
          lastName: 'X',
        })),
      ),
    },
    dafLexemeState: { count: jest.fn(async () => 0) },
    dafLesson: { findFirst: jest.fn(async () => ({ id: 1 })) },
  } as any;
}

/** The old formulas, straight from attempts. */
function eski(studentId: number) {
  const mine = U.filter((u) => u.studentId === studentId);
  const montag = wochenStartUtc(NOW);
  const haftaSum = (pred: (u: Urinish) => boolean) => {
    const m = new Map<number, number>();
    for (const u of U.filter((x) => x.createdAt >= montag && pred(x)))
      m.set(u.studentId, (m.get(u.studentId) ?? 0) + u.points);
    return m;
  };
  return {
    gesamt: mine.reduce((s, u) => s + u.points, 0),
    serie: serieAus(
      mine.map((u) => tashkentDateStr(u.createdAt)),
      tashkentDateStr(NOW),
    ),
    wochePunkte: haftaSum(() => true).get(studentId) ?? 0,
    gruppeWoche: haftaSum((u) => u.groupId === 'g-1'),
  };
}

describe('day totals give the same numbers as the attempts', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it.each([7, 9, 55])('student %i: total, streak and this week', async (id) => {
    const f = await new FortschrittService(fakeDayPrisma()).uebersicht(id, 1);
    const e = eski(id);
    expect(f.gesamt).toBe(e.gesamt);
    expect(f.serie).toBe(e.serie);
    expect(f.wochePunkte).toBe(e.wochePunkte);
  });

  it('the Sunday 23:50 attempt stays in last week', async () => {
    const f = await new FortschrittService(fakeDayPrisma()).uebersicht(7, 1);
    expect(f.wochePunkte).toBe(20);
  });

  it('the group table counts only points earned in that group', async () => {
    const r = await new FortschrittService(fakeDayPrisma()).reyting(
      55,
      1,
      'gruppe',
    );
    const e = eski(55).gruppeWoche;
    expect(r.find((z) => z.studentId === 55)!.punkte).toBe(e.get(55));
    expect(r.find((z) => z.studentId === 7)!.punkte).toBe(e.get(7));
  });

  it('the centre table ranks exactly like the old weekly sum', async () => {
    const r = await new FortschrittService(fakeDayPrisma()).reyting(
      55,
      1,
      'zentrum',
    );
    expect(r.map((z) => [z.studentId, z.punkte])).toEqual([
      [55, 40],
      [9, 30],
      [7, 20],
    ]);
  });
});

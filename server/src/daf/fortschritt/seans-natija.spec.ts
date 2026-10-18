import { FortschrittService } from './fortschritt.service';
import { zentrumQueryRaw } from './zentrum-sql.fake-spec';

const NOW = new Date('2026-10-19T09:00:00Z'); // Monday 14:00 Tashkent

function fake(opts: {
  session: { points: number; createdAt: Date; groupId: string | null }[];
  todayAttempts: number;
  week: { studentId: number; points: number }[];
  groupWeek?: { studentId: number; points: number }[];
  groupId?: string | null;
}) {
  return {
    // The centre's week: ranked in SQL, answered by the reference fake.
    $queryRaw: zentrumQueryRaw(() => opts.week),
    dafAttempt: { findMany: jest.fn(async () => opts.session) },
    dafStudentDay: {
      // The service only asks for `_sum.attempts` here (today's attempts).
      aggregate: jest.fn(async ({ _sum }: any) =>
        _sum.attempts
          ? { _sum: { attempts: opts.todayAttempts } }
          : { _sum: { points: 0 } },
      ),
      findMany: jest.fn(async () => [
        { day: new Date('2026-10-18T00:00:00.000Z') },
        { day: new Date('2026-10-19T00:00:00.000Z') },
      ]),
      // Only the group table still uses groupBy.
      groupBy: jest.fn(async () =>
        (opts.groupWeek ?? []).map((w) => ({
          studentId: w.studentId,
          _sum: { points: w.points },
        })),
      ),
    },
    enrollment: {
      findFirst: jest.fn(async () =>
        opts.groupId ? { groupId: opts.groupId } : null,
      ),
      findMany: jest.fn(async () =>
        (opts.groupWeek ?? []).map((w) => ({ studentId: w.studentId })),
      ),
    },
  } as any;
}

describe('seansNatijasi', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it('points come from the session, the rank moves by this week’s share', async () => {
    const svc = new FortschrittService(
      fake({
        session: [
          {
            points: 30,
            createdAt: new Date('2026-10-19T08:50:00Z'),
            groupId: 'g-1',
          },
          {
            points: 20,
            createdAt: new Date('2026-10-19T08:55:00Z'),
            groupId: 'g-1',
          },
        ],
        todayAttempts: 2,
        week: [
          { studentId: 55, points: 70 }, // 20 before this session
          { studentId: 7, points: 40 },
        ],
        groupWeek: [
          { studentId: 55, points: 70 },
          { studentId: 7, points: 40 },
        ],
        groupId: 'g-1',
      }),
    );
    const n = await svc.seansNatijasi('s-1', 55, 1);
    expect(n.punkte).toBe(50);
    expect(n.orin.zentrum).toEqual({ oldin: 2, hozir: 1 });
    expect(n.orin.gruppe).toEqual({ oldin: 2, hozir: 1 });
    expect(n.serie).toBe(2);
    expect(n.serieYangi).toBe(true); // nothing else today
  });

  it('not the first practice today → serieYangi false', async () => {
    const svc = new FortschrittService(
      fake({
        session: [
          {
            points: 10,
            createdAt: new Date('2026-10-19T08:50:00Z'),
            groupId: null,
          },
        ],
        todayAttempts: 5,
        week: [{ studentId: 55, points: 10 }],
      }),
    );
    const n = await svc.seansNatijasi('s-1', 55, 1);
    expect(n.serieYangi).toBe(false);
    expect(n.orin.gruppe).toBeNull();
  });

  it('a session that began last Sunday subtracts only this week’s points', async () => {
    const svc = new FortschrittService(
      fake({
        session: [
          // Sunday 23:55 Tashkent — last week.
          {
            points: 40,
            createdAt: new Date('2026-10-18T18:55:00Z'),
            groupId: null,
          },
          // Monday 00:05 Tashkent — this week.
          {
            points: 10,
            createdAt: new Date('2026-10-18T19:05:00Z'),
            groupId: null,
          },
        ],
        todayAttempts: 1,
        week: [
          { studentId: 55, points: 10 },
          { studentId: 7, points: 5 },
        ],
      }),
    );
    const n = await svc.seansNatijasi('s-1', 55, 1);
    expect(n.punkte).toBe(50);
    // Before: 55 had 0 this week, so 7 (5) was ahead.
    expect(n.orin.zentrum).toEqual({ oldin: 2, hozir: 1 });
  });

  it('seansNatijasiXavfsiz: no session id → null; a failure → null, not a throw', async () => {
    const svc = new FortschrittService(
      fake({ session: [], todayAttempts: 0, week: [] }),
    );
    expect(await svc.seansNatijasiXavfsiz(undefined, 55, 1)).toBeNull();
    jest
      .spyOn(svc, 'seansNatijasi')
      .mockRejectedValueOnce(new Error('db down'));
    expect(await svc.seansNatijasiXavfsiz('s-1', 55, 1)).toBeNull();
  });
});

import type { Prisma } from '@prisma/client';
import { FortschrittService } from './fortschritt.service';
import { zentrumQueryRaw } from './zentrum-sql.fake-spec';

const NOW = new Date('2026-10-19T09:00:00Z'); // Monday 14:00 Tashkent

function fake(opts: {
  session: { points: number; createdAt: Date; groupId: string | null }[];
  todayAttempts: number;
  week: { studentId: number; points: number }[];
  groupWeek?: { studentId: number; points: number }[];
  groupId?: string | null;
  dailyGoal?: string | null;
  /** Muddati kelgan so'zlar (`bosh` tekshiruvi). */
  due?: number;
  ochiqDars?: boolean;
  /** `bosh` tekshiruvidagi dars so'rovi yiqiladi. */
  darsXato?: boolean;
  /** Qo'shimcha mashq qilingan kunlar (seriya uchun), YYYY-MM-DD. */
  oldingiKunlar?: string[];
  /** O'rganilgan so'zlar (nishon sharti). */
  woerter?: number;
  /** INSERT … RETURNING javobi; `'xato'` — so'rov yiqiladi. */
  badges?: string[] | 'xato';
  /** `/* liga-sharoiti *\/` javobi (S3); standart — xonada, kechikkan yo'q. */
  liga?: Partial<{
    tier: number;
    azo: boolean;
    kechikkan: boolean;
    xonaGolib: boolean;
    guruhBirinchi: boolean;
  }>;
  ligaXato?: boolean;
}) {
  // Day rows for the SQL fake: the week dated today (Monday), the caller's
  // row carrying today's attempts, and a Sunday row for the streak.
  const zentrum = zentrumQueryRaw(
    () => [
      ...opts.week.map((w) => ({
        ...w,
        companyId: 1,
        day: '2026-10-19',
        attempts: w.studentId === 55 ? opts.todayAttempts : 1,
      })),
      ...['2026-10-18', ...(opts.oldingiKunlar ?? [])].map((day) => ({
        studentId: 55,
        companyId: 1,
        day,
        points: 0,
        attempts: 1,
      })),
    ],
    () => opts.dailyGoal ?? null,
  );
  return {
    $queryRaw: jest.fn((sql: Prisma.Sql) => {
      if (sql.strings[0].includes('/* liga-sharoiti */')) {
        if (opts.ligaXato) return Promise.reject(new Error('db down'));
        return Promise.resolve([
          {
            tier: 0,
            azo: true,
            kechikkan: false,
            xonaGolib: false,
            guruhBirinchi: false,
            ...opts.liga,
          },
        ]);
      }
      if (!sql.strings[0].includes('/* nishon-berish */')) return zentrum(sql);
      if (opts.badges === 'xato') return Promise.reject(new Error('db down'));
      return Promise.resolve((opts.badges ?? []).map((key) => ({ key })));
    }),
    dafAttempt: { findMany: jest.fn(async () => opts.session) },
    dafStudentDay: {
      // Only the group table still uses groupBy.
      groupBy: jest.fn(async () =>
        (opts.groupWeek ?? []).map((w) => ({
          studentId: w.studentId,
          _sum: { points: w.points },
        })),
      ),
    },
    dafLexemeState: {
      count: jest.fn(async ({ where }: any) =>
        where.correctCount ? (opts.woerter ?? 0) : (opts.due ?? 1),
      ),
    },
    dafLesson: {
      findFirst: jest.fn(async () => {
        if (opts.darsXato) throw new Error('db down');
        return opts.ochiqDars === false ? null : { id: 1 };
      }),
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

  describe('maqsad (S2)', () => {
    const seans = (points: number, iso = '2026-10-19T08:50:00Z') => ({
      points,
      createdAt: new Date(iso),
      groupId: null,
    });

    it('seans maqsadni kesib o`tdi — yangiBajarildi', async () => {
      // Bugun 100 (oldin 50 + seans 50), maqsad O'RTA 80.
      const svc = new FortschrittService(
        fake({
          session: [seans(50)],
          todayAttempts: 2,
          week: [{ studentId: 55, points: 100 }],
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.maqsad).toEqual({
        ball: 80,
        hozir: 100,
        bajarildi: true,
        yangiBajarildi: true,
      });
    });

    it('seansdan oldin ham bajarilgan edi — yangi emas, bosh tekshirilmaydi', async () => {
      const prisma = fake({
        session: [seans(20)],
        todayAttempts: 5,
        week: [{ studentId: 55, points: 120 }],
      });
      const n = await new FortschrittService(prisma).seansNatijasi(
        's-1',
        55,
        1,
      );
      expect(n.maqsad.yangiBajarildi).toBe(false);
      expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
    });

    it('yarim tun: kechagi qism bugungi baldan ayirilmaydi', async () => {
      // Yakshanba 23:55 da 30, dushanba 00:05 da 10; bugun jami 60 (oldin 50).
      // Maqsad YENGIL 40 seansdan OLDIN bajarilgan edi.
      const svc = new FortschrittService(
        fake({
          session: [
            seans(30, '2026-10-18T18:55:00Z'),
            seans(10, '2026-10-18T19:05:00Z'),
          ],
          todayAttempts: 3,
          week: [{ studentId: 55, points: 60 }],
          dailyGoal: 'YENGIL',
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.maqsad).toMatchObject({
        ball: 40,
        hozir: 60,
        yangiBajarildi: false,
      });
    });

    it("bosh holat (so'z ham, ochiq dars ham yo'q) — yutuq ko'rsatilmaydi", async () => {
      const svc = new FortschrittService(
        fake({
          session: [seans(50)],
          todayAttempts: 2,
          week: [{ studentId: 55, points: 100 }],
          due: 0,
          ochiqDars: false,
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      // bosh yutuqni yashiradi, lekin ball bo'yicha `bajarildi` ni o'zgartirmaydi.
      expect(n.maqsad).toMatchObject({
        hozir: 100,
        bajarildi: true,
        yangiBajarildi: false,
      });
    });

    it('seans maqsadga AYNAN yetdi — yangiBajarildi', async () => {
      // Bugun 80 (oldin 40 + seans 40), maqsad O'RTA 80.
      const svc = new FortschrittService(
        fake({
          session: [seans(40)],
          todayAttempts: 2,
          week: [{ studentId: 55, points: 80 }],
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.maqsad).toEqual({
        ball: 80,
        hozir: 80,
        bajarildi: true,
        yangiBajarildi: true,
      });
    });

    it('seans maqsadga yetmadi — bajarilmagan, yangi emas', async () => {
      const prisma = fake({
        session: [seans(30)],
        todayAttempts: 2,
        week: [{ studentId: 55, points: 70 }],
      });
      const n = await new FortschrittService(prisma).seansNatijasi(
        's-1',
        55,
        1,
      );
      expect(n.maqsad).toEqual({
        ball: 80,
        hozir: 70,
        bajarildi: false,
        yangiBajarildi: false,
      });
      expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
    });

    it('bosh tekshiruvi yiqilsa natija va nishonlar saqlanadi', async () => {
      const svc = new FortschrittService(
        fake({
          session: [seans(50)],
          todayAttempts: 2,
          week: [{ studentId: 55, points: 100 }],
          due: 0,
          darsXato: true,
          woerter: 50,
          badges: ['WOERTER_50'],
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.punkte).toBe(50);
      expect(n.maqsad).toMatchObject({
        bajarildi: true,
        yangiBajarildi: false,
      });
      expect(n.yangiNishonlar).toEqual(['WOERTER_50']);
    });
  });

  describe('yangiNishonlar (S2)', () => {
    const asos = {
      session: [
        {
          points: 10,
          createdAt: new Date('2026-10-19T08:50:00Z'),
          groupId: null,
        },
      ],
      todayAttempts: 1,
      week: [{ studentId: 55, points: 10 }],
      woerter: 50,
    };

    it('shu seans bergan kalitlar qaytadi', async () => {
      const svc = new FortschrittService(
        fake({ ...asos, badges: ['WOERTER_50'] }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.yangiNishonlar).toEqual(['WOERTER_50']);
    });

    it('allaqachon olingan bo`lsa — bo`sh ro`yxat', async () => {
      const svc = new FortschrittService(fake({ ...asos, badges: [] }));
      expect((await svc.seansNatijasi('s-1', 55, 1)).yangiNishonlar).toEqual(
        [],
      );
    });

    it('nishon berishdagi xato natijani yiqitmaydi', async () => {
      const svc = new FortschrittService(fake({ ...asos, badges: 'xato' }));
      const n = await svc.seansNatijasiXavfsiz('s-1', 55, 1);
      expect(n).not.toBeNull();
      expect(n!.punkte).toBe(10);
      expect(n!.yangiNishonlar).toEqual([]);
    });

    it('liga holati (S3) nishon berishga yetadi', async () => {
      const prisma = fake({
        ...asos,
        liga: { tier: 1, xonaGolib: true },
        badges: ['LIGA_KUMUSH', 'XONA_GOLIB'],
      });
      const n = await new FortschrittService(prisma).seansNatijasi(
        's-1',
        55,
        1,
      );
      expect(n.yangiNishonlar).toEqual(['LIGA_KUMUSH', 'XONA_GOLIB']);
      const insert = prisma.$queryRaw.mock.calls
        .map((c: unknown[]) => c[0] as Prisma.Sql)
        .find((s: Prisma.Sql) => s.strings[0].includes('/* nishon-berish */'))!;
      expect(insert.values).toEqual(
        expect.arrayContaining(['WOERTER_50', 'LIGA_KUMUSH', 'XONA_GOLIB']),
      );
    });

    it('liga so`rovi yiqilsa — S2 nishonlari baribir, natija saqlanadi', async () => {
      const prisma = fake({ ...asos, ligaXato: true, badges: ['WOERTER_50'] });
      const n = await new FortschrittService(prisma).seansNatijasiXavfsiz(
        's-1',
        55,
        1,
      );
      expect(n!.yangiNishonlar).toEqual(['WOERTER_50']);
      const insert = prisma.$queryRaw.mock.calls
        .map((c: unknown[]) => c[0] as Prisma.Sql)
        .find((s: Prisma.Sql) => s.strings[0].includes('/* nishon-berish */'))!;
      expect(insert.values).not.toContain('LIGA_KUMUSH');
    });

    it('oddiy seans: liga holati bitta so`rov, yozuv yo`q (hisob/qo`shilish chaqirilmaydi)', async () => {
      const prisma = fake({ ...asos, badges: [] });
      await new FortschrittService(prisma).seansNatijasi('s-1', 55, 1);
      const sqls = prisma.$queryRaw.mock.calls.map(
        (c: unknown[]) => (c[0] as Prisma.Sql).strings[0],
      );
      expect(
        sqls.filter((x: string) => x.includes('/* liga-sharoiti */')),
      ).toHaveLength(1);
      expect(
        sqls.some((x: string) =>
          /liga-(eng-eski|qulf|xona-och|azo-qosh|hisob)/.test(x),
        ),
      ).toBe(false);
    });
  });
});

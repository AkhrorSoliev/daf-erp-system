import { BadRequestException } from '@nestjs/common';
import { MusobaqaUstozService } from './musobaqa-ustoz.service';

// 2026-10-21 (chorshanba) 10:00 Toshkent → joriy hafta dushanbasi 2026-10-19.
const JETZT = new Date('2026-10-21T05:00:00Z');
const G = 'g1';

function yasa(
  o: {
    azolar?: unknown[];
    ballar?: unknown[];
    kunlar?: unknown[];
    guruhlar?: unknown[];
    haftaQatori?: unknown;
    haftaSoni?: number;
    tarixQatorlari?: unknown[];
  } = {},
) {
  const prisma = {
    enrollment: { findMany: jest.fn().mockResolvedValue(o.azolar ?? []) },
    dafGroupWeek: {
      findFirst: jest.fn().mockResolvedValue(o.haftaQatori ?? null),
      count: jest.fn().mockResolvedValue(o.haftaSoni ?? 0),
      findMany: jest.fn().mockResolvedValue(o.tarixQatorlari ?? []),
    },
    $queryRaw: jest.fn(async (q: { strings: readonly string[] }) => {
      const t = q.strings[0];
      if (t.includes('musobaqa-ustoz-ballar')) return o.ballar ?? [];
      if (t.includes('musobaqa-ustoz-kunlar')) return o.kunlar ?? [];
      if (t.includes('guruhlar-yigindisi')) return o.guruhlar ?? [];
      return [];
    }),
  };
  return { prisma, servis: new MusobaqaUstozService(prisma as never) };
}

const azo = (id: number, f: string, l: string, tier = 0) => ({
  student: {
    id,
    firstName: f,
    lastName: l,
    user: { id: id * 10 },
    dafLeague: { tier },
    dafSetting: null,
    _count: { dafBadges: 2 },
  },
});

describe('MusobaqaUstozService.guruhKorinishi', () => {
  it('joriy hafta: o‘rin S3 jadvalidan, jadvalga kirgan guruh', async () => {
    const { servis } = yasa({
      azolar: [azo(1, 'Vali', 'Aliyev'), azo(2, 'Anvar', 'Karimov')],
      ballar: [{ studentId: 1, guruhBali: 60, jamiBall: 60, faolKunlar: 2 }],
      kunlar: [
        { studentId: 1, tage: ['2026-10-20', '2026-10-21'], bugunBali: 20 },
      ],
      guruhlar: [
        { groupId: G, name: 'A1', azolar: 4, ball: 200 }, // baho 50
        { groupId: 'g2', name: 'B', azolar: 3, ball: 300 }, // baho 100 → 1-o‘rin
        { groupId: 'g3', name: 'C', azolar: 2, ball: 999 }, // 3 dan kam — jadvalda yo‘q
      ],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r).toMatchObject({
      bugun: '2026-10-21',
      haftaBoshi: '2026-10-19',
      joriy: true,
    });
    expect(r.haftalar).toHaveLength(9);
    expect(r.guruh).toEqual({
      holat: 'JADVALDA',
      orin: 2,
      guruhSoni: 2,
      baho: 50,
      azolar: 4,
      ball: 200,
      minAzolar: 3,
    });
    expect(r.oquvchilar[0]).toMatchObject({
      studentId: 1,
      ism: 'Vali Aliyev',
      akkaunt: true,
      seriya: 2,
      bugunBali: 20,
      maqsadBali: 80,
      nishonlar: 2,
      liga: 'Bronza',
    });
  });

  it('3 dan kam a‘zo: KAM_AZO, o‘rin yo‘q', async () => {
    const { servis } = yasa({
      guruhlar: [{ groupId: G, name: 'A1', azolar: 2, ball: 40 }],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.guruh).toMatchObject({
      holat: 'KAM_AZO',
      orin: null,
      guruhSoni: 0,
      baho: 20,
      azolar: 2,
      ball: 40,
    });
  });

  it('faol bo‘lmagan guruh (S3 qatorida yo‘q): FAOL_EMAS', async () => {
    const { servis } = yasa({ guruhlar: [] });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.guruh).toMatchObject({
      holat: 'FAOL_EMAS',
      orin: null,
      azolar: 0,
    });
  });

  it('o‘tgan hafta: DafGroupWeek qatoridan, seriya/maqsad null', async () => {
    const { servis, prisma } = yasa({
      azolar: [azo(1, 'Vali', 'Aliyev')],
      ballar: [{ studentId: 1, guruhBali: 5, jamiBall: 5, faolKunlar: 1 }],
      kunlar: [{ studentId: 1, tage: ['2026-10-14'], bugunBali: 0 }],
      haftaQatori: { place: 4, average: 12.34, members: 5, points: 62 },
      haftaSoni: 30,
    });
    const r = await servis.guruhKorinishi(G, 1, '2026-10-12', JETZT);
    expect(r.joriy).toBe(false);
    expect(r.guruh).toEqual({
      holat: 'JADVALDA',
      orin: 4,
      guruhSoni: 30,
      baho: 12.3,
      azolar: 5,
      ball: 62,
      minAzolar: 3,
    });
    expect(r.oquvchilar[0]).toMatchObject({
      seriya: null,
      bugunBali: null,
      maqsadBali: null,
    });
    // S3 markaz so'rovi o'tgan hafta uchun CHAQIRILMAYDI
    const tegs = prisma.$queryRaw.mock.calls.map(
      (c: [{ strings: readonly string[] }]) => c[0].strings[0],
    );
    expect(tegs.some((t: string) => t.includes('guruhlar-yigindisi'))).toBe(
      false,
    );
  });

  it('o‘tgan hafta, qator yo‘q: YOZUV_YOQ', async () => {
    const { servis } = yasa({});
    const r = await servis.guruhKorinishi(G, 1, '2026-10-12', JETZT);
    expect(r.guruh).toMatchObject({
      holat: 'YOZUV_YOQ',
      orin: null,
      baho: null,
    });
  });

  it('tarix: 8 hafta, qatori yo‘q hafta null', async () => {
    const { servis } = yasa({
      tarixQatorlari: [
        {
          weekStart: new Date('2026-10-12T00:00:00Z'),
          place: 7,
          average: 33.33,
        },
      ],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.tarix).toHaveLength(8);
    expect(r.tarix[0]).toEqual({
      haftaBoshi: '2026-10-12',
      orin: 7,
      baho: 33.3,
    });
    expect(r.tarix[1]).toEqual({
      haftaBoshi: '2026-10-05',
      orin: null,
      baho: null,
    });
  });

  it('a‘zosiz guruh: SQL chaqirilmaydi (bo‘sh IN)', async () => {
    const { servis, prisma } = yasa({
      guruhlar: [{ groupId: G, name: 'A1', azolar: 0, ball: 0 }],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.oquvchilar).toEqual([]);
    const tegs = prisma.$queryRaw.mock.calls.map(
      (c: [{ strings: readonly string[] }]) => c[0].strings[0],
    );
    expect(tegs.some((t: string) => t.includes('musobaqa-ustoz'))).toBe(false);
  });

  it('noto‘g‘ri hafta: 400', async () => {
    const { servis } = yasa({});
    await expect(
      servis.guruhKorinishi(G, 1, '2026-10-20', JETZT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a‘zolar so‘rovi kompaniya bilan cheklangan', async () => {
    const { servis, prisma } = yasa({ guruhlar: [] });
    await servis.guruhKorinishi(G, 7, undefined, JETZT);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: G, status: 'ACTIVE', group: { companyId: 7 } },
      }),
    );
  });
});

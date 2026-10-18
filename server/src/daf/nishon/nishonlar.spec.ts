import { nishonlarRoyxati } from './nishonlar';

const JETZT = new Date('2026-10-19T09:00:00Z'); // dushanba, Toshkent

function prismaFor(opts: {
  kunlar: string[];
  woerter: number;
  olingan: { key: string; earnedAt: Date }[];
}) {
  return {
    dafStudentDay: {
      findMany: jest.fn(async () =>
        opts.kunlar.map((d) => ({ day: new Date(`${d}T00:00:00.000Z`) })),
      ),
    },
    dafLexemeState: { count: jest.fn(async () => opts.woerter) },
    dafStudentBadge: { findMany: jest.fn(async () => opts.olingan) },
  } as any;
}

describe('nishonlarRoyxati', () => {
  it('hamma katalog: olinganiga sana, olinmaganiga «yana N»', async () => {
    const prisma = prismaFor({
      // 4 kunlik joriy seriya (16–19 oktabr).
      kunlar: ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'],
      woerter: 120,
      olingan: [
        { key: 'SERIE_3', earnedAt: new Date('2026-10-18T07:00:00.000Z') },
        { key: 'WOERTER_50', earnedAt: new Date('2026-10-01T10:00:00.000Z') },
      ],
    });
    const r = await nishonlarRoyxati(prisma, 55, JETZT);
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({
      key: 'SERIE_3',
      tur: 'SERIE',
      chegara: 3,
      olingan: '2026-10-18T07:00:00.000Z',
      qoldi: null,
    });
    expect(r.find((x) => x.key === 'SERIE_7')).toMatchObject({
      olingan: null,
      qoldi: 3,
    });
    expect(r.find((x) => x.key === 'WOERTER_150')).toMatchObject({
      olingan: null,
      qoldi: 30,
    });
  });

  it("uzilgan seriya bilan olingan nishon qoladi (olib qo'yilmaydi)", async () => {
    const prisma = prismaFor({
      kunlar: ['2026-10-01'],
      woerter: 0,
      olingan: [
        { key: 'SERIE_7', earnedAt: new Date('2026-09-20T07:00:00.000Z') },
      ],
    });
    const r = await nishonlarRoyxati(prisma, 55, JETZT);
    expect(r.find((x) => x.key === 'SERIE_7')!.olingan).toBe(
      '2026-09-20T07:00:00.000Z',
    );
  });

  it('GET hech narsa yozmaydi', async () => {
    const prisma = prismaFor({ kunlar: [], woerter: 600, olingan: [] });
    await nishonlarRoyxati(prisma, 55, JETZT);
    expect(Object.keys(prisma.dafStudentBadge)).toEqual(['findMany']);
    expect(prisma.dafStudentDay.findMany).toHaveBeenCalledWith({
      where: { studentId: 55, attempts: { gt: 0 } },
      select: { day: true },
      distinct: ['day'],
    });
  });
});

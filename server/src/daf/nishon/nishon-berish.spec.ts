import type { Prisma } from '@prisma/client';
import {
  grantBadges,
  nishonlarniBerXavfsiz,
  woerterSoni,
} from './nishon-berish';

/**
 * A stand-in for the table and its unique key (studentId, key): what
 * `INSERT … ON CONFLICT DO NOTHING RETURNING key` returns is exactly the
 * rows that did not exist yet. Each VALUES tuple binds 4 values:
 * studentId, companyId, key, earnedAt.
 */
function fakeBadgeTable(bor: string[] = [], woerter = 0) {
  const rows = new Set(bor.map((k) => `55|${k}`));
  const $queryRaw = jest.fn(async (sql: Prisma.Sql) => {
    const v = sql.values;
    const out: { key: string }[] = [];
    for (let i = 0; i < v.length; i += 4) {
      const id = `${String(v[i])}|${String(v[i + 2])}`;
      if (rows.has(id)) continue;
      rows.add(id);
      out.push({ key: v[i + 2] as string });
    }
    return out;
  });
  const count = jest.fn(async () => woerter);
  const prisma = { $queryRaw, dafLexemeState: { count } } as any;
  return { prisma, rows, $queryRaw, count };
}

describe('grantBadges', () => {
  it("sharti bajarilgan kalit yo'q — so'rov ham yo'q", async () => {
    const { prisma, $queryRaw } = fakeBadgeTable();
    expect(await grantBadges(prisma, 55, 1, { serie: 2, woerter: 10 })).toEqual(
      [],
    );
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('INSERT … ON CONFLICT DO NOTHING RETURNING bilan yozadi', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable();
    expect(await grantBadges(prisma, 55, 1, { serie: 7, woerter: 0 })).toEqual([
      'SERIE_3',
      'SERIE_7',
    ]);
    const sql = $queryRaw.mock.calls[0][0].strings.join('?');
    expect(sql).toContain('/* nishon-berish */');
    expect(sql).toMatch(/INSERT INTO "DafStudentBadge"/);
    expect(sql).toMatch(/ON CONFLICT \("studentId", "key"\) DO NOTHING/);
    expect(sql).toMatch(/RETURNING "key"/);
  });

  it('ikki marta berilmaydi', async () => {
    const { prisma } = fakeBadgeTable();
    await grantBadges(prisma, 55, 1, { serie: 3, woerter: 0 });
    expect(await grantBadges(prisma, 55, 1, { serie: 3, woerter: 0 })).toEqual(
      [],
    );
  });

  it('parallel ikki chaqiruv — har kalit faqat bir marta «yangi»', async () => {
    const { prisma, rows } = fakeBadgeTable();
    const [a, b] = await Promise.all([
      grantBadges(prisma, 55, 1, { serie: 14, woerter: 0 }),
      grantBadges(prisma, 55, 1, { serie: 14, woerter: 0 }),
    ]);
    expect([...a, ...b].sort()).toEqual(['SERIE_14', 'SERIE_3', 'SERIE_7']);
    expect(rows.size).toBe(3);
  });

  it('allaqachon olingan nishon qaytmaydi, qolgani katalog tartibida', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable(['SERIE_3']);
    $queryRaw.mockResolvedValueOnce([
      { key: 'WOERTER_50' },
      { key: 'SERIE_7' },
    ]);
    expect(await grantBadges(prisma, 55, 1, { serie: 7, woerter: 50 })).toEqual(
      ['SERIE_7', 'WOERTER_50'],
    );
  });

  it('earnedAt berilsa o`sha sana, aks holda hozir yoziladi', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable();
    const kun = new Date('2026-09-03T07:00:00.000Z');
    await grantBadges(
      prisma,
      55,
      1,
      { serie: 7, woerter: 0 },
      { SERIE_3: kun },
    );
    const v = $queryRaw.mock.calls[0][0].values;
    expect(v.slice(0, 4)).toEqual([
      55,
      1,
      'SERIE_3',
      '2026-09-03T07:00:00.000Z',
    ]);
    expect(v[6]).toBe('SERIE_7');
    expect(Date.now() - new Date(v[7] as string).getTime()).toBeLessThan(5_000);
  });
});

describe('woerterSoni', () => {
  it("kamida bir marta to'g'ri javob berilgan so'zlarni sanaydi", async () => {
    const { prisma, count } = fakeBadgeTable([], 42);
    expect(await woerterSoni(prisma, 55)).toBe(42);
    expect(count).toHaveBeenCalledWith({
      where: { studentId: 55, correctCount: { gte: 1 } },
    });
  });
});

describe('nishonlarniBerXavfsiz', () => {
  it("so'z sonini o'qiydi va beradi", async () => {
    const { prisma } = fakeBadgeTable([], 150);
    expect(await nishonlarniBerXavfsiz(prisma, 55, 1, 0)).toEqual([
      'WOERTER_50',
      'WOERTER_150',
    ]);
  });

  it("oldindan boshlangan so'z soni berilsa qayta sanalmaydi", async () => {
    const { prisma, count } = fakeBadgeTable([], 0);
    expect(
      await nishonlarniBerXavfsiz(prisma, 55, 1, 0, Promise.resolve(50)),
    ).toEqual(['WOERTER_50']);
    expect(count).not.toHaveBeenCalled();
  });

  it("so'z soni sanalmagan (null) yoki rad etilgan — bo`sh ro`yxat, INSERT yo'q", async () => {
    const { prisma, $queryRaw } = fakeBadgeTable([], 50);
    await expect(
      nishonlarniBerXavfsiz(prisma, 55, 1, 3, Promise.resolve(null)),
    ).resolves.toEqual([]);
    await expect(
      nishonlarniBerXavfsiz(prisma, 55, 1, 3, Promise.reject(new Error('x'))),
    ).resolves.toEqual([]);
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('xato — bo`sh ro`yxat, otilmaydi (seans saqlangan)', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable([], 50);
    $queryRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(nishonlarniBerXavfsiz(prisma, 55, 1, 3)).resolves.toEqual([]);
  });

  it('liga holati berilsa musobaqa nishonlari ham (S3)', async () => {
    const { prisma } = fakeBadgeTable([], 0);
    expect(
      await nishonlarniBerXavfsiz(
        prisma,
        55,
        1,
        0,
        Promise.resolve(0),
        Promise.resolve({ liga: 2, xonaGolib: true, guruhBirinchi: false }),
      ),
    ).toEqual(['LIGA_KUMUSH', 'LIGA_OLTIN', 'XONA_GOLIB']);
  });

  it('liga holati null — faqat S2 nishonlari', async () => {
    const { prisma } = fakeBadgeTable([], 50);
    expect(
      await nishonlarniBerXavfsiz(
        prisma,
        55,
        1,
        3,
        undefined,
        Promise.resolve(null),
      ),
    ).toEqual(['SERIE_3', 'WOERTER_50']);
  });
});

import type { Prisma } from '@prisma/client';
import { guruhlarJavobi } from './guruhlar-jadvali';
import { ligaBaza } from './liga-baza.fake-spec';

const JETZT = new Date('2026-10-21T09:00:00Z'); // hafta 2026-10-19

/**
 * 12 guruh × 3 a'zo. g-01 eng yaxshi: a'zo boshiga (13 − g) × 3 ball, ya'ni
 * baho g-01 = 36 … g-12 = 3. O'quvchining guruhi — `ozGuruh`.
 */
function baza(ozGuruh: string | null) {
  const { db, h } = ligaBaza();
  for (let g = 1; g <= 12; g += 1) {
    const id = `g-${String(g).padStart(2, '0')}`;
    h.guruhNomlari.set(id, `Guruh ${g}`);
    for (let a = 0; a < 3; a += 1) {
      const sid = g * 10 + a;
      h.azolik.push({ groupId: id, studentId: sid });
      h.kunlar.push({
        studentId: sid,
        companyId: 1,
        day: '2026-10-20',
        groupKey: id,
        points: (13 - g) * 3,
      });
    }
  }
  db.enrollment = {
    findFirst: jest.fn(async () => (ozGuruh ? { groupId: ozGuruh } : null)),
  };
  return { db, h };
}

describe('guruhlarJavobi — GET guruhlar', () => {
  it('TOP 10 + o`z guruhi haqiqiy o`rni bilan', async () => {
    const { db } = baza('g-12');
    const j = await guruhlarJavobi(db, 120, 1, JETZT);
    expect(j.haftaBoshi).toBe('2026-10-19');
    expect(j.minAzolar).toBe(3);
    expect(j.qatorlar).toHaveLength(11);
    expect(j.qatorlar[0]).toEqual({
      groupId: 'g-01',
      name: 'Guruh 1',
      baho: 36,
      azolar: 3,
      platz: 1,
      selbst: false,
    });
    expect(j.qatorlar[10]).toEqual({
      groupId: 'g-12',
      name: 'Guruh 12',
      baho: 3,
      azolar: 3,
      platz: 12,
      selbst: true,
    });
    expect(j.oz).toEqual({ orin: 12, baho: 3, azolar: 3, nomi: 'Guruh 12' });
  });

  it('o`z guruhi TOP 10 ichida — takrorlanmaydi', async () => {
    const j = await guruhlarJavobi(baza('g-03').db, 30, 1, JETZT);
    expect(j.qatorlar).toHaveLength(10);
    expect(j.qatorlar.filter((q) => q.selbst).map((q) => q.platz)).toEqual([3]);
  });

  it('guruhsiz yoki 3 kishidan kam guruh — oz: null, kichik guruh jadvalda yo`q', async () => {
    expect((await guruhlarJavobi(baza(null).db, 999, 1, JETZT)).oz).toBeNull();
    const { db, h } = baza('g-kichik');
    h.azolik.push(
      { groupId: 'g-kichik', studentId: 900 },
      { groupId: 'g-kichik', studentId: 901 },
    );
    const j = await guruhlarJavobi(db, 900, 1, JETZT);
    expect(j.oz).toBeNull();
    expect(j.qatorlar.some((q) => q.groupId === 'g-kichik')).toBe(false);
  });

  it('mashq qilmagan a`zo bahoni pasaytiradi; boshqa guruh uchun topilgan ball sanalmaydi', async () => {
    const { db, h } = baza(null);
    h.azolik.push({ groupId: 'g-01', studentId: 999 }); // 4-a'zo, 0 ball
    h.kunlar.push({
      studentId: 10,
      companyId: 1,
      day: '2026-10-20',
      groupKey: 'g-05',
      points: 500,
    });
    const j = await guruhlarJavobi(db, 999, 1, JETZT);
    // g-01: 108 / 4 = 27 — g-02 (33) va g-03 (30) dan keyin, g-04 (27) bilan tengda id kichik.
    expect(j.qatorlar.find((q) => q.groupId === 'g-01')).toMatchObject({
      baho: 27,
      azolar: 4,
      platz: 3,
    });
    expect(j.qatorlar.find((q) => q.groupId === 'g-05')).toMatchObject({
      baho: 24,
    });
  });

  it('SQL: faol guruh, faol a`zolik, guruh kaliti — a`zoning o`zi; GET hech narsa yozmaydi', async () => {
    const { db, h } = baza(null);
    await guruhlarJavobi(db, 1, 1, JETZT);
    const sql = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const matn = sql.strings.join('?');
    expect(matn).toContain('/* guruhlar-yigindisi */');
    expect(matn).toMatch(/g\."statusEnum" = 'ACTIVE'/);
    expect(matn).toMatch(/g\."deletedAt" IS NULL/);
    expect(matn).toMatch(/e\.status = 'ACTIVE'/);
    expect(matn).toMatch(/d\."groupKey" = a\."groupId"/);
    // Hafta qatorlari a'zolarga qo'shilishdan OLDIN (o'quvchi, guruh) bo'yicha yig'iladi.
    expect(matn).toMatch(/GROUP BY x\."studentId", x\."groupKey"/);
    expect(sql.values).toEqual([1, 1, '2026-10-19', '2026-10-26']);
    expect(h.chaqiruvlar).toEqual(['guruhlar-yigindisi']);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});

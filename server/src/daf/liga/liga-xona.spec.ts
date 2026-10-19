import type { Prisma } from '@prisma/client';
import { joinRoom, ligaJavobi, ligaSharoiti } from './liga-xona';
import { ligaBaza, type LigaBazaHolati } from './liga-baza.fake-spec';

const JETZT = new Date('2026-10-21T09:00:00Z'); // chorshanba, Toshkent
const HAFTA = '2026-10-19';
const OTGAN = '2026-10-12';

const sqlOf = (mock: jest.Mock, belgi: string) =>
  mock.mock.calls
    .map((c) => c[0] as Prisma.Sql)
    .find((s) => s.strings[0].includes(`/* ${belgi} */`))!;

/** `n` a'zoli xona, a'zolar `id * 100 + i`. */
function xonaQosh(
  h: LigaBazaHolati,
  id: number,
  number: number,
  n: number,
  tier = 0,
  weekStart = HAFTA,
) {
  h.xonalar.push({
    id,
    companyId: 1,
    weekStart,
    tier,
    number,
    settledAt: null,
  });
  for (let i = 0; i < n; i += 1) {
    h.kirishlar.push({
      id: id * 100 + i,
      roomId: id,
      studentId: id * 100 + i,
      companyId: 1,
      weekStart,
      tier,
      place: null,
      points: null,
      promoted: false,
    });
  }
}

describe('ligaSharoiti — seans oxiridagi bitta so`rov', () => {
  it('bitta SQL: daraja, a`zolik, kechikkan hisob, ikki g`olib belgisi', async () => {
    const { db } = ligaBaza();
    await ligaSharoiti(db, 55, 1, JETZT);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlOf(db.$queryRaw, 'liga-sharoiti');
    const matn = sql.strings.join('?');
    for (const ustun of [
      'AS tier',
      'AS azo',
      'AS kechikkan',
      'AS "xonaGolib"',
      'AS "guruhBirinchi"',
    ])
      expect(matn).toContain(ustun);
    expect(sql.values.slice(0, 4)).toEqual([55, HAFTA, 55, 1]);
  });

  it('daraja qatori yo`q — Bronza (0), xonada emas', async () => {
    const { db } = ligaBaza();
    expect(await ligaSharoiti(db, 55, 1, JETZT)).toEqual({
      tier: 0,
      azo: false,
      kechikkan: false,
      xonaGolib: false,
      guruhBirinchi: false,
    });
  });

  it('xona g`olibi: 1-o`rin, kamida 50 ball, xonada kamida 5 kishi', async () => {
    const holat = (points: number, n: number) => {
      const { db, h } = ligaBaza();
      xonaQosh(h, 1, 1, n, 0, OTGAN);
      h.xonalar[0].settledAt = new Date();
      h.kirishlar.forEach((k, i) =>
        Object.assign(k, { place: i + 1, points: i === 0 ? points : 0 }),
      );
      h.kirishlar[0].studentId = 55;
      return ligaSharoiti(db, 55, 1, JETZT);
    };
    expect((await holat(50, 5)).xonaGolib).toBe(true);
    expect((await holat(49, 5)).xonaGolib).toBe(false);
    expect((await holat(50, 4)).xonaGolib).toBe(false);
  });

  it('guruh birinchi: o`sha hafta SHU guruh uchun kamida 1 ball', async () => {
    const { db, h } = ligaBaza();
    h.guruhHaftalari.push({
      companyId: 1,
      weekStart: OTGAN,
      groupId: 'g-1',
      place: 1,
      average: 9,
      members: 3,
      points: 27,
    });
    h.kunlar.push({
      studentId: 55,
      companyId: 1,
      day: '2026-10-14',
      groupKey: 'g-2',
      points: 30,
    });
    expect((await ligaSharoiti(db, 55, 1, JETZT)).guruhBirinchi).toBe(false);
    h.kunlar.push({
      studentId: 55,
      companyId: 1,
      day: '2026-10-18',
      groupKey: 'g-1',
      points: 10,
    });
    expect((await ligaSharoiti(db, 55, 1, JETZT)).guruhBirinchi).toBe(true);
  });

  it('kechikkan: kompaniyada o`tgan haftaning hisoblanmagan xonasi bor', async () => {
    const { db, h } = ligaBaza();
    xonaQosh(h, 1, 1, 2, 0, OTGAN);
    expect((await ligaSharoiti(db, 55, 1, JETZT)).kechikkan).toBe(true);
  });
});

describe('joinRoom — hafta ichida qo`shilish', () => {
  it('xona yo`q — 1-xona ochiladi; daraja qatori yo`q o`quvchi Bronzada', async () => {
    const { db, h } = ligaBaza();
    const r = await joinRoom(db, 55, 1, JETZT);
    expect(r.yangi).toBe(true);
    expect(h.xonalar).toEqual([
      expect.objectContaining({
        id: r.roomId,
        weekStart: HAFTA,
        tier: 0,
        number: 1,
      }),
    ]);
    expect(h.kirishlar).toEqual([
      expect.objectContaining({
        roomId: r.roomId,
        studentId: 55,
        weekStart: HAFTA,
        tier: 0,
      }),
    ]);
  });

  it('o`z darajasining a`zosi eng kam xonasiga', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 2);
    xonaQosh(h, 1, 1, 20, 2);
    xonaQosh(h, 2, 2, 18, 2);
    xonaQosh(h, 3, 3, 5, 0);
    expect((await joinRoom(db, 55, 1, JETZT)).roomId).toBe(2);
  });

  it('hamma xona 30 — yangi xona keyingi raqam bilan', async () => {
    const { db, h } = ligaBaza();
    xonaQosh(h, 1, 1, 30);
    xonaQosh(h, 2, 2, 30);
    const r = await joinRoom(db, 55, 1, JETZT);
    expect(h.xonalar.find((x) => x.id === r.roomId)?.number).toBe(3);
  });

  it('allaqachon a`zo — o`sha xona, yozuv yo`q', async () => {
    const { db, h } = ligaBaza();
    xonaQosh(h, 1, 1, 3);
    h.kirishlar[0].studentId = 55;
    expect(await joinRoom(db, 55, 1, JETZT)).toEqual({
      roomId: 1,
      yangi: false,
    });
    expect(h.chaqiruvlar).not.toContain('liga-azo-qosh');
    expect(h.chaqiruvlar).not.toContain('liga-xona-och');
  });

  it('qulflar: hisob qulfi (shared) → daraja → daraja qulfi → tekshiruv; ON CONFLICT bilan', async () => {
    const { db, h } = ligaBaza();
    await joinRoom(db, 55, 1, JETZT);
    expect(h.chaqiruvlar.slice(0, 4)).toEqual([
      'liga-qulf-umumiy',
      'liga-daraja',
      'liga-xona-qulf',
      'liga-kirish',
    ]);
    expect(sqlOf(db.$queryRaw, 'liga-qulf-umumiy').strings.join('?')).toContain(
      'pg_advisory_xact_lock_shared',
    );
    expect(sqlOf(db.$executeRaw, 'liga-azo-qosh').strings.join('?')).toMatch(
      /ON CONFLICT \("weekStart", "studentId"\) DO NOTHING/,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('ligaJavobi — GET liga', () => {
  it('xonada emas: daraja ko`rinadi, xona yo`q', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 1);
    expect(await ligaJavobi(db, 55, JETZT)).toEqual({
      haftaBoshi: HAFTA,
      haftaOxiri: '2026-10-25',
      azo: false,
      daraja: { tier: 1, nomi: 'Kumush' },
      xona: null,
      otganHafta: null,
    });
  });

  it('xona jadvali: shu hafta ballari (hamma guruh), saralangan, o`z qatori, 15 kishidan zona faol', async () => {
    const { db, h } = ligaBaza();
    h.xonalar.push({
      id: 1,
      companyId: 1,
      weekStart: HAFTA,
      tier: 0,
      number: 2,
      settledAt: null,
    });
    for (let i = 0; i < 15; i += 1)
      h.kirishlar.push({
        id: 10 + i,
        roomId: 1,
        studentId: 50 + i,
        companyId: 1,
        weekStart: HAFTA,
        tier: 0,
        place: null,
        points: null,
        promoted: false,
      });
    h.kunlar.push(
      {
        studentId: 55,
        companyId: 1,
        day: '2026-10-20',
        groupKey: 'g-1',
        points: 40,
      },
      {
        studentId: 55,
        companyId: 1,
        day: '2026-10-21',
        groupKey: '',
        points: 20,
      },
      {
        studentId: 51,
        companyId: 1,
        day: '2026-10-19',
        groupKey: '',
        points: 60,
      },
      {
        studentId: 52,
        companyId: 1,
        day: '2026-10-18',
        groupKey: '',
        points: 999,
      },
    );
    h.ismlar.set(55, ['Ali', 'Valiyev']);
    const j = await ligaJavobi(db, 55, JETZT);
    expect(j.azo).toBe(true);
    expect(j.xona).toMatchObject({
      raqam: 2,
      hajmi: 15,
      kotarilishZonasi: { soni: 5, faol: true },
    });
    expect(j.xona!.qatorlar.slice(0, 3)).toEqual([
      { studentId: 51, name: 'Ism 51', punkte: 60, platz: 1, selbst: false },
      {
        studentId: 55,
        name: 'Ali Valiyev',
        punkte: 60,
        platz: 2,
        selbst: true,
      },
      { studentId: 50, name: 'Ism 50', punkte: 0, platz: 3, selbst: false },
    ]);
  });

  it('o`tgan hafta: hisoblangan bo`lsa o`rin, ko`tarilish, xona hajmi; hisoblanmagan bo`lsa null', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 1);
    xonaQosh(h, 7, 1, 16, 0, OTGAN);
    h.kirishlar.forEach((k, i) =>
      Object.assign(k, { place: i + 1, points: 100 - i, promoted: i < 5 }),
    );
    h.kirishlar[2].studentId = 55;
    expect((await ligaJavobi(db, 55, JETZT)).otganHafta).toEqual({
      daraja: { tier: 0, nomi: 'Bronza' },
      orin: 3,
      kotarildi: true,
      hajmi: 16,
    });
    for (const k of h.kirishlar) k.place = null;
    expect((await ligaJavobi(db, 55, JETZT)).otganHafta).toBeNull();
  });

  it('Olmos xonasi: zona yo`q; GET hech narsa yozmaydi', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 4);
    xonaQosh(h, 1, 1, 1, 4);
    h.kirishlar[0].studentId = 55;
    const j = await ligaJavobi(db, 55, JETZT);
    expect(j.xona!.kotarilishZonasi).toEqual({ soni: 0, faol: false });
    expect(h.chaqiruvlar).toEqual(['liga-holat', 'liga-xona']);
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

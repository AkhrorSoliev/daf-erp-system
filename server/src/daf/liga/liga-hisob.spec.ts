import type { Prisma } from '@prisma/client';
import { settleDue, settleWeek } from './liga-hisob';
import { ligaBaza, type LigaBazaHolati } from './liga-baza.fake-spec';

const JETZT = new Date('2026-10-21T09:00:00Z'); // joriy hafta 2026-10-19
const HAFTA = '2026-10-19';
const OTGAN = '2026-10-12';

/** Xona `id`, a'zolar `id * 100 + i`, har biri `kun` da `ball(i)` ball topgan. */
function xonaBilan(
  h: LigaBazaHolati,
  o: {
    id: number;
    tier: number;
    n: number;
    ball: (i: number) => number;
    week?: string;
    kun?: string;
  },
) {
  const week = o.week ?? OTGAN;
  h.xonalar.push({
    id: o.id,
    companyId: 1,
    weekStart: week,
    tier: o.tier,
    number: o.id,
    settledAt: null,
  });
  for (let i = 0; i < o.n; i += 1) {
    const sid = o.id * 100 + i;
    h.kirishlar.push({
      id: o.id * 1000 + i,
      roomId: o.id,
      studentId: sid,
      companyId: 1,
      weekStart: week,
      tier: o.tier,
      place: null,
      points: null,
      promoted: false,
    });
    const p = o.ball(i);
    if (p > 0)
      h.kunlar.push({
        studentId: sid,
        companyId: 1,
        day: o.kun ?? '2026-10-14',
        groupKey: '',
        points: p,
      });
  }
}

const sqlOf = (mock: jest.Mock, belgi: string) =>
  mock.mock.calls
    .map((c) => (c[0] as Prisma.Sql).strings.join('?'))
    .find((s) => s.includes(`/* ${belgi} */`))!;

describe('settleWeek — hafta oxiri', () => {
  it('o`rin va ball yoziladi, birinchi 5 tasi (≥ 50) ko`tariladi, xona hisoblandi', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: (i) => 100 - i * 5 });
    const n = await settleWeek(db, 1, OTGAN, { kutish: true });
    expect(h.chaqiruvlar[0]).toBe('liga-qulf');
    expect(n).toMatchObject({
      haftaBoshi: OTGAN,
      bajarildi: true,
      xonalar: 1,
      azolar: 16,
      kotarildi: 5,
    });
    expect(h.xonalar.find((x) => x.id === 1)!.settledAt).not.toBeNull();
    const k = h.kirishlar
      .filter((x) => x.roomId === 1)
      .sort((a, b) => a.place! - b.place!);
    expect(k.map((x) => x.points)).toEqual(
      Array.from({ length: 16 }, (_, i) => 100 - i * 5),
    );
    expect(k.filter((x) => x.promoted).map((x) => x.studentId)).toEqual([
      100, 101, 102, 103, 104,
    ]);
    expect([100, 101, 102, 103, 104].map((s) => h.darajalar.get(s))).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(h.darajalar.has(105)).toBe(false);
    expect(sqlOf(db.$queryRaw, 'liga-xonalarni-ol')).toMatch(
      /WHERE[\s\S]*"settledAt" IS NULL[\s\S]*RETURNING id, tier/,
    );
  });

  it('ikki marta = bir marta: ikkinchisi hech narsa olmaydi va o`zgartirmaydi', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: (i) => 100 - i * 5 });
    await settleWeek(db, 1, OTGAN, { kutish: true });
    const holat = () =>
      JSON.stringify({
        k: h.kirishlar,
        d: [...h.darajalar],
        x: h.xonalar,
        g: h.guruhHaftalari,
      });
    const oldin = holat();
    expect(await settleWeek(db, 1, OTGAN, { kutish: true })).toMatchObject({
      xonalar: 0,
      azolar: 0,
      kotarildi: 0,
      yangiXonalar: 0,
    });
    expect(holat()).toBe(oldin);
  });

  it('daraja pastga tushmaydi (GREATEST)', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 15, ball: () => 60 });
    h.darajalar.set(100, 3);
    await settleWeek(db, 1, OTGAN, { kutish: true });
    expect(h.darajalar.get(100)).toBe(3);
    expect(h.darajalar.get(101)).toBe(1);
    expect(sqlOf(db.$executeRaw, 'liga-kotar')).toMatch(
      /GREATEST\("DafStudentLeague"\.tier, EXCLUDED\.tier\)/,
    );
  });

  it('Olmosda va 14 kishilik xonada ko`tarilish yo`q, o`rinlar baribir', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 4, n: 20, ball: () => 500 });
    xonaBilan(h, { id: 2, tier: 1, n: 14, ball: () => 500 });
    expect((await settleWeek(db, 1, OTGAN, { kutish: true })).kotarildi).toBe(
      0,
    );
    const otganlar = h.kirishlar.filter((k) => k.weekStart === OTGAN);
    expect(otganlar).toHaveLength(34);
    expect(otganlar.every((k) => k.place !== null && !k.promoted)).toBe(true);
  });

  it('yangi hafta: ≥ 1 ball topganlar teng xonalarga; 0 ballilar xonasiz; hafta ichida qo`shilgan joyida', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 30, ball: (i) => (i < 25 ? 10 : 0) });
    xonaBilan(h, { id: 2, tier: 0, n: 30, ball: (i) => (i < 15 ? 10 : 0) });
    // 200-o'quvchi dushanba kuni hisobdan oldin o'zi qo'shilgan:
    h.xonalar.push({
      id: 9,
      companyId: 1,
      weekStart: HAFTA,
      tier: 0,
      number: 1,
      settledAt: null,
    });
    h.kirishlar.push({
      id: 9000,
      roomId: 9,
      studentId: 200,
      companyId: 1,
      weekStart: HAFTA,
      tier: 0,
      place: null,
      points: null,
      promoted: false,
    });
    const n = await settleWeek(db, 1, OTGAN, { kutish: true });
    const yangi = h.xonalar.filter((x) => x.weekStart === HAFTA && x.id !== 9);
    expect(n.yangiXonalar).toBe(2);
    expect(yangi.map((x) => x.number).sort((a, b) => a - b)).toEqual([2, 3]);
    // 40 faol − 200 (allaqachon 9-xonada) = 39 → 20 + 19
    expect(
      yangi
        .map((x) => h.kirishlar.filter((k) => k.roomId === x.id).length)
        .sort((a, b) => a - b),
    ).toEqual([19, 20]);
    expect(
      h.kirishlar.filter((k) => k.weekStart === HAFTA && k.studentId === 200),
    ).toHaveLength(1);
    expect(
      h.kirishlar.some((k) => k.weekStart === HAFTA && k.studentId === 125),
    ).toBe(false);
  });

  it('ko`tarilgan o`quvchi yangi haftada yangi darajasining xonasida', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 15, ball: (i) => 100 - i });
    await settleWeek(db, 1, OTGAN, { kutish: true });
    const tierOf = (sid: number) =>
      h.kirishlar.find((k) => k.weekStart === HAFTA && k.studentId === sid)
        ?.tier;
    expect(tierOf(100)).toBe(1);
    expect(tierOf(105)).toBe(0);
  });

  it('kutmaydigan chaqiruv: qulf band — hech narsa yozilmaydi', async () => {
    const { db, h } = ligaBaza({ qulfBosh: false });
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: () => 60 });
    expect(await settleWeek(db, 1, OTGAN, { kutish: false })).toMatchObject({
      bajarildi: false,
      xonalar: 0,
    });
    expect(h.xonalar[0].settledAt).toBeNull();
    expect(h.chaqiruvlar).toEqual(['liga-qulf-sinash']);
  });

  it('hisob xona qulfini hech olmaydi, kompaniya qulfini AJRATIB oladi (qulf tartibi)', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: () => 60 });
    await settleWeek(db, 1, OTGAN, { kutish: true });
    expect(h.chaqiruvlar).not.toContain('liga-xona-qulf');
    expect(h.chaqiruvlar).not.toContain('liga-qulf-umumiy');
    const qulf = sqlOf(db.$queryRaw, 'liga-qulf');
    expect(qulf).toMatch(/pg_advisory_xact_lock\(/);
    expect(qulf).not.toMatch(/shared/);
    const sinash = ligaBaza();
    await settleWeek(sinash.db, 1, OTGAN, { kutish: false });
    expect(sqlOf(sinash.db.$queryRaw, 'liga-qulf-sinash')).toMatch(
      /pg_try_advisory_xact_lock\(/,
    );
  });

  it('guruhlar jadvali haftasi bir marta yoziladi (xonasiz hafta ham)', async () => {
    const { db, h } = ligaBaza();
    for (const [g, ball, baza] of [
      ['g-a', 30, 500],
      ['g-b', 60, 510],
    ] as const) {
      for (let a = 0; a < 3; a += 1) {
        h.azolik.push({ groupId: g, studentId: baza + a });
        h.kunlar.push({
          studentId: baza + a,
          companyId: 1,
          day: '2026-10-13',
          groupKey: g,
          points: ball,
        });
      }
    }
    expect((await settleWeek(db, 1, OTGAN, { kutish: true })).guruhlar).toBe(2);
    expect(
      h.guruhHaftalari.map((g) => [
        g.groupId,
        g.weekStart,
        g.place,
        g.average,
        g.members,
        g.points,
      ]),
    ).toEqual([
      ['g-b', OTGAN, 1, 60, 3, 180],
      ['g-a', OTGAN, 2, 30, 3, 90],
    ]);
    expect((await settleWeek(db, 1, OTGAN, { kutish: true })).guruhlar).toBe(0);
    expect(h.guruhHaftalari).toHaveLength(2);
  });
});

describe('settleDue — kechikkan haftalar', () => {
  it('eng eski hisoblanmagan haftadan boshlab, keyin o`tgan hafta; joriy haftaga tegmaydi', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, {
      id: 1,
      tier: 0,
      n: 3,
      ball: () => 10,
      week: '2026-10-05',
      kun: '2026-10-07',
    });
    xonaBilan(h, {
      id: 2,
      tier: 0,
      n: 2,
      ball: () => 10,
      week: HAFTA,
      kun: '2026-10-20',
    });
    const natija = await settleDue(db, 1, JETZT, { kutish: true });
    expect(natija.map((n) => n.haftaBoshi)).toEqual(['2026-10-05', OTGAN]);
    expect(
      h.xonalar
        .filter((x) => x.weekStart < HAFTA)
        .every((x) => x.settledAt !== null),
    ).toBe(true);
    expect(h.xonalar.find((x) => x.id === 2)!.settledAt).toBeNull();
  });

  it('hisoblanmagan xona yo`q — faqat o`tgan haftaning guruhlar jadvali', async () => {
    const { db } = ligaBaza();
    expect(
      (await settleDue(db, 1, JETZT, { kutish: true })).map(
        (n) => n.haftaBoshi,
      ),
    ).toEqual([OTGAN]);
  });

  it('band qulf (kutmaydi) — darhol to`xtaydi', async () => {
    const { db, h } = ligaBaza({ qulfBosh: false });
    xonaBilan(h, { id: 1, tier: 0, n: 3, ball: () => 10 });
    const natija = await settleDue(db, 1, JETZT, { kutish: false });
    expect(natija).toEqual([
      expect.objectContaining({ haftaBoshi: OTGAN, bajarildi: false }),
    ]);
  });
});

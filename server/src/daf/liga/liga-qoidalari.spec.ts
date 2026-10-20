import {
  ENG_YUQORI_DARAJA,
  GURUH_MIN_AZO,
  LIGA_NOMLARI,
  XONA_SIGIMI,
  bahoKorinishi,
  darajaNomi,
  engKamXona,
  guruhlarniSarala,
  kotarilishZonasi,
  saralaXona,
  tengBol,
  xonaHash,
  xonaNatijasi,
  xonalarSoni,
} from './liga-qoidalari';

/** n a'zo: id 1..n, ball `ball(i)` (standart — kamayib boradi). */
const xona = (n: number, ball: (i: number) => number = (i) => 100 - i) =>
  Array.from({ length: n }, (_, i) => ({ studentId: i + 1, points: ball(i) }));

describe('liga darajalari', () => {
  it('besh daraja, Bronzadan Olmosgacha', () => {
    expect(LIGA_NOMLARI).toEqual([
      'Bronza',
      'Kumush',
      'Oltin',
      'Yoqut',
      'Olmos',
    ]);
    expect(ENG_YUQORI_DARAJA).toBe(4);
    expect(darajaNomi(0)).toBe('Bronza');
    expect(darajaNomi(4)).toBe('Olmos');
  });
});

describe('saralaXona', () => {
  it('ball kamayishi, teng ballda studentId kichigi yuqorida, nol ballilar ham', () => {
    expect(
      saralaXona([
        { studentId: 9, points: 0 },
        { studentId: 3, points: 40 },
        { studentId: 2, points: 40 },
        { studentId: 1, points: 0 },
      ]).map((a) => a.studentId),
    ).toEqual([2, 3, 1, 9]);
  });
});

describe('xonaNatijasi — hafta oxiri', () => {
  it('15 kishilik xonada birinchi 5 tasi ko`tariladi, hammaga o`rin', () => {
    const r = xonaNatijasi(xona(15), 0);
    expect(r.filter((q) => q.promoted).map((q) => q.place)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(r.map((q) => q.place)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
  });

  it('14 kishilik xonada hech kim ko`tarilmaydi, o`rinlar baribir yoziladi', () => {
    const r = xonaNatijasi(xona(14), 0);
    expect(r.some((q) => q.promoted)).toBe(false);
    expect(r[0]).toEqual({
      studentId: 1,
      points: 100,
      place: 1,
      promoted: false,
    });
  });

  it('kamida 50 ball: 50 lik 2-o`rin ko`tariladi, 49 lik 3-o`rin yo`q', () => {
    const r = xonaNatijasi(
      xona(15, (i) => [80, 50, 49, 30, 10][i] ?? 0),
      1,
    );
    expect(r.filter((q) => q.promoted).map((q) => q.studentId)).toEqual([1, 2]);
  });

  it('5- va 6-o`rinda teng ball: kichik id 5-o`rin va ko`tariladi, kattasi yo`q', () => {
    const azolar = xona(15, (i) => (i < 4 ? 100 : 0));
    azolar[4] = { studentId: 30, points: 70 };
    azolar[5] = { studentId: 20, points: 70 };
    const r = xonaNatijasi(azolar, 0);
    expect(r.find((q) => q.studentId === 20)).toMatchObject({
      place: 5,
      promoted: true,
    });
    expect(r.find((q) => q.studentId === 30)).toMatchObject({
      place: 6,
      promoted: false,
    });
  });

  it('Olmosda ko`tarilish yo`q', () => {
    expect(xonaNatijasi(xona(30), 4).some((q) => q.promoted)).toBe(false);
  });
});

describe('kotarilishZonasi', () => {
  it('Olmosdan pastda 5 ta; faol — xona kamida 15 kishi bo`lganda', () => {
    expect(kotarilishZonasi(14, 0)).toEqual({ soni: 5, faol: false });
    expect(kotarilishZonasi(15, 3)).toEqual({ soni: 5, faol: true });
    expect(kotarilishZonasi(30, 4)).toEqual({ soni: 0, faol: false });
  });
});

describe('taqsimot', () => {
  it.each([
    [0, 0],
    [1, 1],
    [25, 1],
    [26, 2],
    [40, 2],
    [50, 2],
    [51, 3],
    [61, 3],
  ])('%i faol → %i xona', (n, k) => {
    expect(xonalarSoni(n)).toBe(k);
  });

  it('teng bo`linadi: 40 → 20 + 20, 26 → 13 + 13, 61 → 21 + 20 + 20, 25 → bitta', () => {
    const olcham = (n: number) =>
      tengBol(
        Array.from({ length: n }, (_, i) => 10_000 + i),
        '2026-10-19',
      ).map((x) => x.length);
    expect(olcham(40)).toEqual([20, 20]);
    expect(olcham(26)).toEqual([13, 13]);
    expect(olcham(61)).toEqual([21, 20, 20]);
    expect(olcham(25)).toEqual([25]);
    expect(olcham(0)).toEqual([]);
  });

  it('har o`quvchi aynan bir marta; kirish tartibidan qat`i nazar bir xil natija', () => {
    const ids = Array.from({ length: 61 }, (_, i) => 10_000 + i);
    const a = tengBol(ids, '2026-10-19');
    expect(a.flat().sort((x, y) => x - y)).toEqual(ids);
    expect(tengBol([...ids].reverse(), '2026-10-19')).toEqual(a);
  });

  it('tartib hashdan: id ketma-ketligi emas, boshqa haftada boshqa', () => {
    const ids = Array.from({ length: 40 }, (_, i) => 10_000 + i);
    const birinchi = tengBol(ids, '2026-10-19')[0];
    expect(birinchi).not.toEqual(ids.filter((_, i) => i % 2 === 0));
    expect(tengBol(ids, '2026-10-26')[0]).not.toEqual(birinchi);
  });

  it('xonaHash — 32 bitli, takrorlanuvchi', () => {
    const h = xonaHash(10_001, '2026-10-19');
    expect(xonaHash(10_001, '2026-10-19')).toBe(h);
    expect(xonaHash(10_002, '2026-10-19')).not.toBe(h);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('engKamXona — hafta ichida qo`shilish', () => {
  it('a`zosi eng kam xona; tengda raqami kichigi', () => {
    expect(
      engKamXona([
        { id: 1, number: 1, hajm: 20 },
        { id: 3, number: 3, hajm: 18 },
        { id: 2, number: 2, hajm: 18 },
      ]),
    ).toBe(2);
  });

  it('hammasi 30 — null (yangi xona ochiladi); 29 — hali sig`adi', () => {
    expect(engKamXona([{ id: 1, number: 1, hajm: XONA_SIGIMI }])).toBeNull();
    expect(engKamXona([{ id: 1, number: 1, hajm: 29 }])).toBe(1);
    expect(engKamXona([])).toBeNull();
  });
});

describe('guruhlarniSarala', () => {
  const g = (groupId: string, azolar: number, ball: number) => ({
    groupId,
    name: groupId.toUpperCase(),
    azolar,
    ball,
  });

  it('baho = ball ÷ hamma faol a`zo (mashq qilmaganlar 0 sifatida)', () => {
    expect(guruhlarniSarala([g('a', 4, 100)])[0].baho).toBe(25);
  });

  it('2 kishilik guruh chiqmaydi, 3 kishilik chiqadi', () => {
    expect(
      guruhlarniSarala([g('a', 2, 900), g('b', GURUH_MIN_AZO, 3)]).map(
        (r) => r.groupId,
      ),
    ).toEqual(['b']);
  });

  it('baho ↓, teng bo`lsa guruh id ↑; saralash yaxlitlanmagan son bo`yicha', () => {
    const r = guruhlarniSarala([
      g('c', 3, 30),
      g('b', 3, 30),
      g('e', 25, 251),
      g('a', 3, 31),
      g('d', 4, 40),
    ]);
    // a 10.33 · e 10.04 · b, c, d 10
    expect(r.map((x) => [x.groupId, x.place])).toEqual([
      ['a', 1],
      ['e', 2],
      ['b', 3],
      ['c', 4],
      ['d', 5],
    ]);
    expect(bahoKorinishi(31 / 3)).toBe(10.3);
    expect(bahoKorinishi(251 / 25)).toBe(10);
  });
});

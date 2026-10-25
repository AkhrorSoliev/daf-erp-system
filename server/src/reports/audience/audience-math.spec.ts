import {
  AGE_BANDS,
  MIN_KNOWN,
  bandsOf,
  buildOverview,
  departureBandsOf,
  statOf,
} from './audience-math';
import type { AudienceStudent } from './audience.types';

const TODAY = '2026-10-17';

const student = (over: Partial<AudienceStudent> = {}): AudienceStudent => ({
  gender: null,
  birthDate: null,
  branchId: 1,
  branchName: "Farg'ona",
  courseId: 'c1',
  courseName: 'Standart',
  level: 'A1',
  ...over,
});

const NO_DEPARTED = { systemTotal: 0, departed: { ages: [], ageUnknown: 0 } };

/** `n` students born `years` years before TODAY (a birthday already passed this year). */
const aged = (n: number, years: number, over: Partial<AudienceStudent> = {}) =>
  Array.from({ length: n }, () =>
    student({ birthDate: `${2026 - years}-01-01`, ...over }),
  );

describe('statOf', () => {
  it('hides shares and the average while fewer than MIN_KNOWN are known', () => {
    const s = statOf(
      [...aged(MIN_KNOWN - 1, 20, { gender: 'MALE' }), student()],
      TODAY,
    );
    expect(s.total).toBe(MIN_KNOWN);
    expect(s.genderKnown).toBe(MIN_KNOWN - 1);
    expect(s.malePct).toBeNull();
    expect(s.femalePct).toBeNull();
    expect(s.ageKnown).toBe(MIN_KNOWN - 1);
    expect(s.avgAge).toBeNull();
  });

  it('counts unknowns apart: they never enter a share', () => {
    const s = statOf(
      [
        ...aged(8, 20, { gender: 'MALE' }),
        ...aged(2, 20, { gender: 'FEMALE' }),
        ...Array.from({ length: 90 }, () => student()),
      ],
      TODAY,
    );
    expect(s.total).toBe(100);
    expect(s.genderKnown).toBe(10);
    expect(s.malePct).toBe(80);
    expect(s.femalePct).toBe(20);
  });

  it('the two shares always add up to 100', () => {
    const s = statOf(
      [
        ...Array.from({ length: 1 }, () => student({ gender: 'MALE' })),
        ...Array.from({ length: 6 }, () => student({ gender: 'FEMALE' })),
      ],
      TODAY,
    );
    expect((s.malePct ?? 0) + (s.femalePct ?? 0)).toBe(100);
  });

  it('averages full years and rounds to one decimal', () => {
    const s = statOf([...aged(3, 19), ...aged(2, 20), student()], TODAY);
    expect(s.ageKnown).toBe(5);
    expect(s.avgAge).toBe(19.4);
  });

  it('a birthday later this year does not count yet', () => {
    const s = statOf(
      Array.from({ length: MIN_KNOWN }, () =>
        student({ birthDate: '2006-12-31' }),
      ),
      TODAY,
    );
    expect(s.avgAge).toBe(19);
  });
});

describe('bandsOf', () => {
  it('puts the edges in the right band', () => {
    const ages = [11, 12, 15, 16, 18, 19, 22, 23, 29, 30];
    const bands = bandsOf(
      ages.map((a) => student({ birthDate: `${2026 - a}-01-01` })),
      TODAY,
    );
    expect(Object.fromEntries(bands.map((b) => [b.key, b.count]))).toEqual({
      u12: 1,
      '12-15': 2,
      '16-18': 2,
      '19-22': 2,
      '23-29': 2,
      '30+': 1,
    });
  });

  it('has one row per band, in order, and null shares under MIN_KNOWN', () => {
    const bands = bandsOf(aged(MIN_KNOWN - 1, 17), TODAY);
    expect(bands.map((b) => b.key)).toEqual(AGE_BANDS.map((b) => b.key));
    expect(bands.every((b) => b.pct === null)).toBe(true);
  });
});

describe('buildOverview parity', () => {
  const students = [
    ...aged(6, 17, {
      gender: 'MALE',
      branchId: 1,
      branchName: 'A',
      courseId: 'x',
      courseName: 'X',
    }),
    ...aged(5, 25, {
      gender: 'FEMALE',
      branchId: 2,
      branchName: 'B',
      courseId: 'y',
      courseName: 'Y',
    }),
    student({
      branchId: null,
      branchName: null,
      courseId: null,
      courseName: null,
    }),
  ];

  it('branch rows and course rows each add up to the page total', () => {
    const o = buildOverview(students, TODAY, NO_DEPARTED);
    expect(o.summary.total).toBe(12);
    expect(o.branches.reduce((a, r) => a + r.total, 0)).toBe(12);
    expect(o.courses.reduce((a, r) => a + r.total, 0)).toBe(12);
    expect(o.branches.reduce((a, r) => a + r.genderKnown, 0)).toBe(
      o.summary.genderKnown,
    );
    expect(o.branches.reduce((a, r) => a + r.ageKnown, 0)).toBe(
      o.summary.ageKnown,
    );
  });

  it('band counts add up to the known ages', () => {
    const o = buildOverview(students, TODAY, NO_DEPARTED);
    expect(o.bands.reduce((a, b) => a + b.count, 0)).toBe(o.summary.ageKnown);
  });

  it('lists the biggest row first and names a missing branch or course', () => {
    const o = buildOverview(students, TODAY, NO_DEPARTED);
    expect(o.branches.map((r) => r.name)).toEqual([
      'A',
      'B',
      'Filial belgilanmagan',
    ]);
    expect(o.courses[2].name).toBe('Kurs belgilanmagan');
  });

  it('level rows add up to the page total, in level order, with a row for a missing level', () => {
    const withLevels = [
      ...aged(6, 17, { level: 'B1' }),
      ...aged(5, 25, { level: 'A1' }),
      student({ level: null }),
      student({ level: 'A2' }),
    ];
    const o = buildOverview(withLevels, TODAY, NO_DEPARTED);
    expect(o.levels.map((r) => r.name)).toEqual([
      'A1',
      'A2',
      'B1',
      'Daraja belgilanmagan',
    ]);
    expect(o.levels.reduce((a, r) => a + r.total, 0)).toBe(13);
  });

  it('passes the system total and the unknown-age leavers through unchanged', () => {
    const o = buildOverview(students, TODAY, {
      systemTotal: 1240,
      departed: { ages: [], ageUnknown: 7 },
    });
    expect(o.systemTotal).toBe(1240);
    expect(o.departuresAgeUnknown).toBe(7);
  });
});

describe('departureBandsOf', () => {
  it('counts who studies and who left per band, and the leaving share', () => {
    const studying = [...aged(12, 17), ...aged(4, 25)];
    const rows = departureBandsOf(
      studying,
      { ages: [17, 17, 17, 17, 25], ageUnknown: 0 },
      TODAY,
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey['16-18']).toMatchObject({
      active: 12,
      departed: 4,
      share: 25,
    });
    expect(byKey['23-29']).toMatchObject({ active: 4, departed: 1, share: 20 });
    expect(rows.map((r) => r.key)).toEqual(AGE_BANDS.map((b) => b.key));
  });

  it('prints no share while fewer than MIN_KNOWN people stand behind a band', () => {
    const rows = departureBandsOf(
      aged(2, 20),
      { ages: [20], ageUnknown: 0 },
      TODAY,
    );
    const band = rows.find((r) => r.key === '19-22');
    expect(band).toMatchObject({ active: 2, departed: 1, share: null });
  });

  it('a band with nobody has zero counts and no share', () => {
    const rows = departureBandsOf([], { ages: [], ageUnknown: 0 }, TODAY);
    expect(rows.every((r) => r.active === 0 && r.departed === 0)).toBe(true);
    expect(rows.every((r) => r.share === null)).toBe(true);
  });
});

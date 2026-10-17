import {
  AGE_BANDS,
  MIN_KNOWN,
  bandsOf,
  buildOverview,
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
  ...over,
});

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
    const o = buildOverview(students, TODAY);
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
    const o = buildOverview(students, TODAY);
    expect(o.bands.reduce((a, b) => a + b.count, 0)).toBe(o.summary.ageKnown);
  });

  it('lists the biggest row first and names a missing branch or course', () => {
    const o = buildOverview(students, TODAY);
    expect(o.branches.map((r) => r.name)).toEqual([
      'A',
      'B',
      'Filial belgilanmagan',
    ]);
    expect(o.courses[2].name).toBe('Kurs belgilanmagan');
  });
});

import type { RateVersion } from './deserved-math';
import {
  computeMissedLessons,
  type MissedLessonCharge,
  type MissedLessonsInput,
} from './missed-lessons';

const pct30: RateVersion = {
  salaryType: 'PERCENTAGE',
  value: 30,
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  effectiveTo: null,
};

const charge = (
  over: Partial<MissedLessonCharge> = {},
): MissedLessonCharge => ({
  groupId: 'g1',
  studentId: 1,
  coveredDates: ['2026-10-02', '2026-10-05', '2026-10-07'],
  frozenOutDates: [],
  perLessonCost: 34_615,
  plannedLessons: 13,
  ...over,
});

const input = (over: Partial<MissedLessonsInput> = {}): MissedLessonsInput => ({
  teacherId: 7,
  groups: [
    {
      id: 'g1',
      name: 'A1-1',
      plannedDates: ['2026-10-02', '2026-10-05', '2026-10-07'],
    },
  ],
  takenLessons: new Set(['g1::2026-10-02']),
  overrides: new Map(),
  charges: [charge(), charge({ studentId: 2 })],
  excused: new Set(),
  rateVersions: { byGroup: new Map(), global: [pct30] },
  ...over,
});

describe('computeMissedLessons («Berilmadi»)', () => {
  it('lists every planned lesson with no attendance, with its students and the lost pay', () => {
    const r = computeMissedLessons(input());
    expect(r.lessons).toEqual([
      {
        date: '2026-10-05',
        groupId: 'g1',
        groupName: 'A1-1',
        students: 2,
        amount: 2 * 10_385,
      },
      {
        date: '2026-10-07',
        groupId: 'g1',
        groupName: 'A1-1',
        students: 2,
        amount: 2 * 10_385,
      },
    ]);
    expect(r.total).toBe(4 * 10_385);
  });

  it('skips a lesson a substitute override gave to other teachers', () => {
    const r = computeMissedLessons(
      input({ overrides: new Map([['g1::2026-10-05', [8]]]) }),
    );
    expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-07']);
  });

  it('keeps a lesson whose override still names this teacher', () => {
    const r = computeMissedLessons(
      input({ overrides: new Map([['g1::2026-10-05', [7, 8]]]) }),
    );
    expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('counts only students whose charge covers the day and has not frozen it out', () => {
    const r = computeMissedLessons(
      input({
        charges: [
          charge(),
          charge({ studentId: 2, frozenOutDates: ['2026-10-07'] }),
          charge({ studentId: 3, coveredDates: ['2026-10-07'] }),
        ],
      }),
    );
    expect(r.lessons.map((l) => [l.date, l.students])).toEqual([
      ['2026-10-05', 2],
      ['2026-10-07', 2],
    ]);
  });

  it('leaves out a student pre-marked «Sababli»', () => {
    const r = computeMissedLessons(
      input({ excused: new Set(['g1::2::2026-10-05']) }),
    );
    expect(r.lessons[0]).toMatchObject({ students: 1, amount: 10_385 });
  });

  it('counts a student with two charges in one group-month once', () => {
    const r = computeMissedLessons(input({ charges: [charge(), charge()] }));
    expect(r.lessons[0].students).toBe(1);
  });

  it('leaves out a lesson with nobody paid for it', () => {
    const r = computeMissedLessons(input({ charges: [] }));
    expect(r).toEqual({ lessons: [], total: 0 });
  });

  it('prefers the per-group rate over the global one', () => {
    const fixed: RateVersion = {
      salaryType: 'FIXED_PER_STUDENT',
      value: 130_000,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null,
    };
    const r = computeMissedLessons(
      input({
        rateVersions: { byGroup: new Map([['g1', [fixed]]]), global: [pct30] },
      }),
    );
    expect(r.lessons[0].amount).toBe(2 * 10_000);
  });

  it('lists the lesson at zero when no rate covers the day', () => {
    const r = computeMissedLessons(
      input({ rateVersions: { byGroup: new Map(), global: [] } }),
    );
    expect(r.lessons[0]).toMatchObject({ students: 2, amount: 0 });
  });
});

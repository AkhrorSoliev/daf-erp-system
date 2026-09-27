import { departureRelease } from './departure-release';

const SEPT = [
  '2026-09-01',
  '2026-09-03',
  '2026-09-05',
  '2026-09-08',
  '2026-09-10',
  '2026-09-12',
  '2026-09-15',
  '2026-09-17',
  '2026-09-19',
  '2026-09-22',
  '2026-09-24',
  '2026-09-26',
  '2026-09-29',
];
const base = {
  departureDay: '2026-09-20',
  coveredDates: SEPT,
  frozenOutDates: [] as string[],
  coveredLessons: 13,
  perLessonCost: 34_615,
  discountPercent: 0,
  chargedAmount: 450_000,
  lessonsThroughDeparture: 0,
};

describe('departureRelease', () => {
  it('releases the covered lessons after the departure day', () => {
    expect(departureRelease(base)).toEqual({
      lessons: 4,
      amount: 138_460,
      frozenOutAfter: ['2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'],
    });
  });
  it('keeps the departure day itself as held', () => {
    expect(
      departureRelease({ ...base, departureDay: '2026-09-22' })?.lessons,
    ).toBe(3);
  });
  it('skips dates already frozen out (a repeat call releases nothing)', () => {
    expect(
      departureRelease({
        ...base,
        frozenOutDates: [
          '2026-09-22',
          '2026-09-24',
          '2026-09-26',
          '2026-09-29',
        ],
      }),
    ).toBeNull();
  });
  it('adds to earlier frozen-out dates, sorted', () => {
    expect(
      departureRelease({
        ...base,
        departureDay: '2026-09-25',
        frozenOutDates: ['2026-09-29'],
      }),
    ).toEqual({
      lessons: 1,
      amount: 34_615,
      frozenOutAfter: ['2026-09-26', '2026-09-29'],
    });
  });
  it('legacy row without dates counts against the month plan', () => {
    expect(
      departureRelease({
        ...base,
        coveredDates: [],
        lessonsThroughDeparture: 9,
      }),
    ).toEqual({ lessons: 4, amount: 138_460, frozenOutAfter: null });
  });
  it('prices at the discounted lesson price', () => {
    expect(departureRelease({ ...base, discountPercent: 50 })?.amount).toBe(
      69_232,
    );
  });
  it('never releases more than was charged', () => {
    expect(departureRelease({ ...base, chargedAmount: 5 })?.amount).toBe(5);
  });
  it('a 100% discount month releases nothing', () => {
    expect(departureRelease({ ...base, discountPercent: 100 })).toBeNull();
  });
});

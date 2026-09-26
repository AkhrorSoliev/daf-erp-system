import {
  loadFrozenMonthlyCharges,
  monthlyChargeBilledDate,
  monthlyPerLessonKey,
  resolveHeldLessonPrice,
} from './monthly-per-lesson';

describe('monthlyChargeBilledDate', () => {
  it('covers a listed date', () => {
    expect(
      monthlyChargeBilledDate({ coveredDates: ['2026-09-02'] }, '2026-09-02'),
    ).toBe(true);
  });

  it('does not cover a date outside the list', () => {
    expect(
      monthlyChargeBilledDate({ coveredDates: ['2026-09-02'] }, '2026-09-04'),
    ).toBe(false);
  });

  it('does not cover a date a freeze took back', () => {
    expect(
      monthlyChargeBilledDate(
        { coveredDates: ['2026-09-02'], frozenOutDates: ['2026-09-02'] },
        '2026-09-02',
      ),
    ).toBe(false);
  });

  it('treats a row written before coveredDates existed as the whole month', () => {
    expect(monthlyChargeBilledDate({ coveredDates: [] }, '2026-09-30')).toBe(
      true,
    );
  });
});

describe('resolveHeldLessonPrice', () => {
  const charge = {
    perLessonCost: 34_615,
    plannedLessons: 13,
    coveredDates: ['2026-09-02', '2026-09-04'],
    frozenOutDates: [],
  };

  // Production 2026-09: the switch to monthly billing re-billed September on
  // the monthly price but left each lesson's 12-pack marker (37 500) in place.
  it('prices a lesson the monthly charge billed at the monthly price, over the old pack marker', () => {
    expect(
      resolveHeldLessonPrice({
        charge,
        dateStr: '2026-09-02',
        consumed: 37_500,
        legacyPrice: 37_500,
      }),
    ).toBe(34_615);
  });

  it('keeps the pack price for a lesson the monthly charge did not bill', () => {
    expect(
      resolveHeldLessonPrice({
        charge,
        dateStr: '2026-09-09',
        consumed: 37_500,
        legacyPrice: 37_500,
      }),
    ).toBe(37_500);
  });

  it('falls back to the course price for a legacy marker without one', () => {
    expect(
      resolveHeldLessonPrice({
        charge: undefined,
        dateStr: '2026-06-02',
        consumed: null,
        legacyPrice: 33_333,
      }),
    ).toBe(33_333);
  });

  it('uses the monthly price for an unmarked lesson even off the covered list', () => {
    expect(
      resolveHeldLessonPrice({
        charge,
        dateStr: '2026-09-09',
        consumed: undefined,
        legacyPrice: 37_500,
      }),
    ).toBe(34_615);
  });

  it('reports nothing for a lesson nothing billed', () => {
    expect(
      resolveHeldLessonPrice({
        charge: undefined,
        dateStr: '2026-09-02',
        consumed: undefined,
        legacyPrice: 37_500,
      }),
    ).toBeUndefined();
  });
});

// A student who leaves a group and rejoins it within the month carries two
// CHARGED charges, each billing its own dates (PR #571). Keeping one per key
// dropped the other's dates, and those lessons fell back to the old pack
// price — the overstatement ADR-0038 removes.
describe('a student who rejoined the same group within the month', () => {
  const rows = [
    {
      studentId: 1,
      groupId: 'g',
      periodYear: 2026,
      periodMonth: 9,
      perLessonCost: 34_615,
      plannedLessons: 13,
      coveredDates: ['2026-09-02', '2026-09-04', '2026-09-07'],
      frozenOutDates: ['2026-09-07'],
    },
    {
      studentId: 1,
      groupId: 'g',
      periodYear: 2026,
      periodMonth: 9,
      perLessonCost: 34_615,
      plannedLessons: 13,
      coveredDates: ['2026-09-21', '2026-09-23'],
      frozenOutDates: [],
    },
  ];

  it('keeps every charge’s dates', async () => {
    const prisma = {
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const charges = await loadFrozenMonthlyCharges(prisma as any, {
      companyId: 1,
      studentIds: [1],
      groupIds: ['g'],
      periods: [{ year: 2026, month: 9 }],
    });
    const c = charges.get(monthlyPerLessonKey(1, 'g', '2026-09'))!;

    expect(monthlyChargeBilledDate(c, '2026-09-02')).toBe(true); // first stay
    expect(monthlyChargeBilledDate(c, '2026-09-21')).toBe(true); // after rejoin
    expect(monthlyChargeBilledDate(c, '2026-09-07')).toBe(false); // left by then
    expect(monthlyChargeBilledDate(c, '2026-09-14')).toBe(false); // away
    expect(
      resolveHeldLessonPrice({
        charge: c,
        dateStr: '2026-09-02',
        consumed: 37_500,
        legacyPrice: 37_500,
      }),
    ).toBe(34_615);
  });
});

import {
  isTransitionMonth,
  lifetimeValue,
  marketingMonths,
} from './marketing.math';

describe('isTransitionMonth', () => {
  it('May and June 2026 are the transition months', () => {
    expect(isTransitionMonth('2026-05')).toBe(true);
    expect(isTransitionMonth('2026-06')).toBe(true);
    expect(isTransitionMonth('2026-07')).toBe(false);
  });
});

describe('marketingMonths', () => {
  const months = ['2026-10', '2026-09', '2026-06'];
  const spendByMonth = new Map([
    ['2026-10', 400_000],
    ['2026-09', 0],
    ['2026-06', 200_000],
  ]);
  const firstPayments = [
    { firstMonth: '2026-10', paid: 900_000 },
    { firstMonth: '2026-10', paid: 450_000 },
    { firstMonth: '2026-09', paid: 1_350_000 },
    { firstMonth: '2026-06', paid: 2_000_000 },
    { firstMonth: '2026-11', paid: 999_000 }, // a later month: not on the list
  ];

  it('puts each student in the month of the first payment, with what the cohort paid since', () => {
    const [october] = marketingMonths({ months, spendByMonth, firstPayments });
    expect(october).toEqual({
      month: '2026-10',
      spend: 400_000,
      newStudents: 2,
      cac: 200_000,
      cohortPaid: 1_350_000,
      roi: 3.38, // 1 350 000 ÷ 400 000, two decimals
      transition: false,
    });
  });

  it('has no samara when nothing was spent', () => {
    const september = marketingMonths({
      months,
      spendByMonth,
      firstPayments,
    })[1];
    expect(september).toMatchObject({
      spend: 0,
      newStudents: 1,
      cac: 0,
      cohortPaid: 1_350_000,
      roi: null,
    });
  });

  it('a transition month counts its new students but computes nothing from them', () => {
    const june = marketingMonths({ months, spendByMonth, firstPayments })[2];
    expect(june).toEqual({
      month: '2026-06',
      spend: 200_000,
      newStudents: 1,
      cac: null,
      cohortPaid: null,
      roi: null,
      transition: true,
    });
  });

  it('has no jalb qilish narxi without new students', () => {
    const [august] = marketingMonths({
      months: ['2026-08'],
      spendByMonth: new Map([['2026-08', 300_000]]),
      firstPayments: [],
    });
    expect(august).toMatchObject({
      newStudents: 0,
      cac: null,
      cohortPaid: 0,
      roi: 0,
    });
  });
});

describe('lifetimeValue', () => {
  const charges = {
    month: '2026-10',
    charged: 4_500_000,
    paid: 0,
    unpaid: 0,
    paidPct: 0,
    students: 10,
    unpaidStudents: 0,
  };

  it('is the average study months times the month charge per student', () => {
    expect(lifetimeValue(3.4, charges)).toEqual({
      value: 1_530_000,
      avgMonths: 3.4,
      monthlyCharge: 450_000,
    });
  });

  it('is null when nobody left (0 months), before monthly billing, or with nobody charged', () => {
    expect(lifetimeValue(0, charges)).toBeNull();
    expect(lifetimeValue(3.4, null)).toBeNull();
    expect(
      lifetimeValue(3.4, { ...charges, students: 0, charged: 0 }),
    ).toBeNull();
  });
});

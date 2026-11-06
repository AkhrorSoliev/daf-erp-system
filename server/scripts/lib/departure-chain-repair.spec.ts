import {
  ChainCharge,
  ChainEnrollment,
  planChainRefunds,
} from './departure-chain-repair';

const HOLDER: ChainCharge = {
  id: 'chg-1',
  enrollmentId: 'e1',
  enrollmentCreatedAt: new Date('2026-10-01T00:00:00Z'),
  studentId: 11323,
  groupId: 'g1',
  branchId: 1,
  companyId: 1,
  periodYear: 2026,
  periodMonth: 10,
  coveredDates: ['2026-10-27', '2026-10-29', '2026-10-31'],
  frozenOutDates: [],
  coveredLessons: 3,
  perLessonCost: 32_143,
  discountPercent: 0,
  chargedAmount: 96_429,
};

const REJOINED: ChainEnrollment = {
  id: 'e2',
  studentId: 11323,
  groupId: 'g1',
  groupName: '#031',
  status: 'TRANSFERRED',
  createdAt: new Date('2026-10-28T08:00:00Z'),
  departureDay: '2026-10-29',
};

describe('planChainRefunds (ADR-0140)', () => {
  it('refunds the days after departure from the earlier enrollment charge', () => {
    const plan = planChainRefunds([REJOINED], [HOLDER]);

    expect(plan).toEqual([
      expect.objectContaining({
        enrollmentId: 'e2',
        chargeEnrollmentId: 'e1',
        chargeId: 'chg-1',
        lessons: 1,
        amount: 32_143,
        dates: ['2026-10-31'],
        period: '2026-10',
      }),
    ]);
  });

  it('is idempotent: a day already given back is not refunded again', () => {
    const done = { ...HOLDER, frozenOutDates: ['2026-10-31'] };

    expect(planChainRefunds([REJOINED], [done])).toEqual([]);
  });

  it('skips an enrollment that has a charge of its own', () => {
    const own = { ...HOLDER, id: 'chg-2', enrollmentId: 'e2' };

    expect(planChainRefunds([REJOINED], [own])).toEqual([]);
  });

  it('skips an enrollment that is still active', () => {
    expect(
      planChainRefunds([{ ...REJOINED, status: 'ACTIVE' }], [HOLDER]),
    ).toEqual([]);
  });

  it('ignores a charge of a later enrollment or another group', () => {
    const later = {
      ...HOLDER,
      enrollmentCreatedAt: new Date('2026-10-30T00:00:00Z'),
    };
    const other = { ...HOLDER, id: 'chg-3', groupId: 'g2' };

    expect(planChainRefunds([REJOINED], [later])).toEqual([]);
    expect(planChainRefunds([REJOINED], [other])).toEqual([]);
  });

  it('two chained enrollments never refund the same day twice', () => {
    const third: ChainEnrollment = {
      ...REJOINED,
      id: 'e3',
      createdAt: new Date('2026-10-29T09:00:00Z'),
      departureDay: '2026-10-29',
    };

    const plan = planChainRefunds([REJOINED, third], [HOLDER]);

    expect(plan).toHaveLength(1);
    expect(plan[0].amount).toBe(32_143);
  });

  it('reports what contract 6.2 would have done beside the refund', () => {
    // 2 of 3 lessons held on 29.10 is above 40%.
    const [row] = planChainRefunds([REJOINED], [HOLDER]);

    expect(row.withheldUnder62).toBe(true);
  });
});

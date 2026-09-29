import { PaymentModel, TransactionType } from '@prisma/client';
import { reapplyRateToOpenAccruals } from './rate-reapply';

const TEACHER = 90003;
const COMPANY = 1001;
const GROUP = 'g-072';
// 24.09.2026 00:00 Tashkent — how a version's start is stored.
const FROM_24_09 = new Date('2026-09-23T19:00:00.000Z');

const v = (
  id: string,
  salaryType: string,
  value: number,
  effectiveFrom: string,
  effectiveTo: string | null = null,
) => ({
  id,
  salaryType,
  value,
  effectiveFrom: new Date(effectiveFrom),
  effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
});

const accrual = (over: Record<string, unknown>) => ({
  id: 'a1',
  studentId: 20001,
  groupId: GROUP,
  attendanceId: 'att-1',
  lessonDate: new Date('2026-09-24T00:00:00.000Z'),
  amount: 9_524,
  perLessonCost: 35_238,
  salaryConfigVersionId: 'v-general',
  salaryPaymentId: null,
  ...over,
});

function makeTx(opts: {
  accruals: unknown[];
  configs: unknown[];
  paymentModel?: PaymentModel;
  frozen?: unknown[];
  credits?: unknown[];
  balance?: number;
}) {
  return {
    salaryAccrual: {
      findMany: jest.fn().mockResolvedValue(opts.accruals),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    employeeSalaryConfig: {
      findMany: jest.fn().mockResolvedValue(opts.configs),
    },
    group: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: GROUP,
          course: {
            price: 740_000,
            lessonPaymentCount: 20,
            paymentModel: opts.paymentModel ?? PaymentModel.MONTHLY,
          },
        },
      ]),
    },
    enrollmentMonthlyCharge: {
      findMany: jest.fn().mockResolvedValue(opts.frozen ?? []),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue(opts.credits ?? []),
      createMany: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ balance: opts.balance ?? 0 }]),
    user: { update: jest.fn().mockResolvedValue({}) },
  };
}

// The general 200 000 per-student rate and the #072 group rate of 345 000.
const GENERAL = {
  groupId: null,
  versions: [
    v('v-general', 'FIXED_PER_STUDENT', 200_000, '2026-08-31T19:00:00Z'),
  ],
};
const GROUP_072 = {
  groupId: GROUP,
  versions: [v('v-072', 'FIXED_PER_STUDENT', 345_000, '2026-09-23T19:00:00Z')],
};
const SEPT_CHARGE = (studentId: number) => ({
  studentId,
  groupId: GROUP,
  periodYear: 2026,
  periodMonth: 9,
  perLessonCost: 35_238,
  plannedLessons: 21,
  coveredDates: [],
  frozenOutDates: [],
});

describe('reapplyRateToOpenAccruals', () => {
  it('re-prices #072 from 24.09 at 345 000 over the month’s 21 lessons, and swaps the ledger credit', async () => {
    const tx = makeTx({
      accruals: [
        accrual({ id: 'a1', attendanceId: 'att-1' }),
        accrual({
          id: 'a2',
          attendanceId: 'att-2',
          lessonDate: new Date('2026-09-25T00:00:00.000Z'),
        }),
      ],
      configs: [GENERAL, GROUP_072],
      frozen: [SEPT_CHARGE(20001)],
      credits: [
        {
          id: 'c1',
          attendanceId: 'att-1',
          amount: 9_524,
          branchId: 7,
          companyId: COMPANY,
        },
        {
          id: 'c2',
          attendanceId: 'att-2',
          amount: 9_524,
          branchId: 7,
          companyId: COMPANY,
        },
      ],
      balance: 100_000,
    });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: GROUP,
      effectiveFrom: FROM_24_09,
      performedById: 90456,
    });

    // 345 000 / 21 = 16 429 per lesson.
    expect(summary).toEqual({
      lessons: 2,
      before: 19_048,
      after: 32_858,
      delta: 13_810,
      settled: 0,
      unpriced: 0,
    });
    // The lesson window is the Tashkent DAY of the start, as a @db.Date.
    expect(tx.salaryAccrual.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: TEACHER,
          groupId: GROUP,
          reversedAt: null,
          lessonDate: { gte: new Date('2026-09-24T00:00:00.000Z') },
        }),
      }),
    );
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] } },
      data: { amount: 16_429, salaryConfigVersionId: 'v-072' },
    });

    // Reverse-and-repost per lesson, the balance chained through all four rows.
    const rows = tx.transaction.createMany.mock.calls[0][0].data;
    expect(
      rows.map((r: any) => [r.amount, r.balanceBefore, r.balanceAfter]),
    ).toEqual([
      [-9_524, 100_000, 90_476],
      [16_429, 90_476, 106_905],
      [-9_524, 106_905, 97_381],
      [16_429, 97_381, 113_810],
    ]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        type: TransactionType.SALARY_ACCRUAL,
        reversedTransactionId: 'c1',
        branchId: 7,
        teacherId: TEACHER,
        performedById: 90456,
      }),
    );
    expect(tx.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reversedTransactionId: null }),
      }),
    );
    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] } },
      data: expect.objectContaining({ reversedById: 90456 }),
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: TEACHER },
      data: { balance: 113_810 },
    });
  });

  it('leaves lessons already inside a calculated payroll alone, and counts them', async () => {
    const tx = makeTx({
      accruals: [accrual({ salaryPaymentId: 'sp-1' })],
      configs: [GENERAL, GROUP_072],
    });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: GROUP,
      effectiveFrom: FROM_24_09,
    });

    expect(summary.settled).toBe(1);
    expect(summary.lessons).toBe(0);
    expect(tx.salaryAccrual.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
  });

  it('does not guess a monthly course’s divisor when its frozen charge is missing', async () => {
    const tx = makeTx({
      accruals: [accrual({})],
      configs: [GENERAL, GROUP_072],
      frozen: [],
    });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: GROUP,
      effectiveFrom: FROM_24_09,
    });

    expect(summary.unpriced).toBe(1);
    expect(tx.salaryAccrual.updateMany).not.toHaveBeenCalled();
  });

  it('prices a percentage off the lesson’s own frozen price', async () => {
    const tx = makeTx({
      accruals: [
        accrual({
          amount: 10_000,
          perLessonCost: 20_000,
          salaryConfigVersionId: 'v-50',
        }),
      ],
      configs: [
        {
          groupId: null,
          versions: [
            v(
              'v-50',
              'PERCENTAGE',
              50,
              '2026-08-31T19:00:00Z',
              '2026-09-23T19:00:00Z',
            ),
            v('v-60', 'PERCENTAGE', 60, '2026-09-23T19:00:00Z'),
          ],
        },
      ],
      paymentModel: PaymentModel.LESSON_PACK,
    });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: null,
      effectiveFrom: FROM_24_09,
    });

    expect(summary).toEqual(
      expect.objectContaining({ lessons: 1, before: 10_000, after: 12_000 }),
    );
    expect(tx.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
    // A general rate re-prices every group, so no group filter.
    expect(
      tx.salaryAccrual.findMany.mock.calls[0][0].where.groupId,
    ).toBeUndefined();
  });

  it('writes nothing when the rule in force already gave this price', async () => {
    const tx = makeTx({
      accruals: [accrual({ amount: 16_429, salaryConfigVersionId: 'v-072' })],
      configs: [GENERAL, GROUP_072],
      frozen: [SEPT_CHARGE(20001)],
    });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: GROUP,
      effectiveFrom: FROM_24_09,
    });

    expect(summary.lessons).toBe(0);
    expect(tx.salaryAccrual.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
  });

  it('updates the accrual but invents no ledger credit that was never written', async () => {
    const tx = makeTx({
      accruals: [accrual({})],
      configs: [GENERAL, GROUP_072],
      frozen: [SEPT_CHARGE(20001)],
      credits: [],
    });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: GROUP,
      effectiveFrom: FROM_24_09,
    });

    expect(summary.lessons).toBe(1);
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalled();
    expect(tx.transaction.createMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('leaves a lesson with no rate at all untouched', async () => {
    const tx = makeTx({ accruals: [accrual({})], configs: [] });

    const summary = await reapplyRateToOpenAccruals(tx as never, {
      userId: TEACHER,
      companyId: COMPANY,
      groupId: null,
      effectiveFrom: FROM_24_09,
    });

    expect(summary.unpriced).toBe(1);
    expect(tx.salaryAccrual.updateMany).not.toHaveBeenCalled();
  });
});

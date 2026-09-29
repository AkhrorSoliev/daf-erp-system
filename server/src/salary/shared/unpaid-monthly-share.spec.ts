import {
  loadUnpaidMonthlyShare,
  unpaidShareByTeacher,
  type ShareAccrual,
} from './unpaid-monthly-share';

const acc = (over: Partial<ShareAccrual>): ShareAccrual => ({
  userId: 501,
  studentId: 20001,
  amount: 10_000,
  wasCenterTopUp: false,
  deductionTransactionId: 'charge-sep',
  ...over,
});

describe('unpaidShareByTeacher', () => {
  it('moves the unpaid fraction of the backing charge to the centre', () => {
    // 250 000 of a 400 000 charge unpaid: 62.5% of each lesson's pay.
    const out = unpaidShareByTeacher(
      [acc({}), acc({ amount: 6_000 })],
      new Map([['charge-sep', 250_000]]),
      new Map([['charge-sep', 400_000]]),
    );
    expect(out.get(501)).toBe(10_000); // (10 000 + 6 000) × 0.625
  });

  it('a fully paid charge moves nothing', () => {
    const out = unpaidShareByTeacher(
      [acc({})],
      new Map(),
      new Map([['charge-sep', 400_000]]),
    );
    expect(out.size).toBe(0);
  });

  it('never moves a top-up accrual — it is already the centre’s', () => {
    const out = unpaidShareByTeacher(
      [acc({ wasCenterTopUp: true })],
      new Map([['charge-sep', 400_000]]),
      new Map([['charge-sep', 400_000]]),
    );
    expect(out.size).toBe(0);
  });

  it('caps at the whole lesson even if the ledger reads more unpaid than charged', () => {
    const out = unpaidShareByTeacher(
      [acc({})],
      new Map([['charge-sep', 500_000]]),
      new Map([['charge-sep', 400_000]]),
    );
    expect(out.get(501)).toBe(10_000);
  });
});

describe('loadUnpaidMonthlyShare', () => {
  it('reads only MONTHLY charges and only today’s debtors', async () => {
    const prisma = {
      enrollmentMonthlyCharge: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ transactionId: 'charge-sep' }]),
      },
      student: { findMany: jest.fn().mockResolvedValue([{ id: 20001 }]) },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'charge-sep',
            studentId: 20001,
            type: 'LESSON_DEDUCTION',
            amount: -400_000,
            createdAt: new Date('2026-09-01T00:00:00Z'),
          },
          {
            id: 'pay',
            studentId: 20001,
            type: 'PAYMENT',
            amount: 100_000,
            createdAt: new Date('2026-09-05T00:00:00Z'),
          },
        ]),
      },
    };
    const out = await loadUnpaidMonthlyShare(prisma as never, 1001, [
      acc({}),
      // A pack deduction backs this one: money the student had put down.
      acc({ userId: 502, deductionTransactionId: 'pack-deduction' }),
    ]);

    expect(out.get(501)).toBe(7_500); // 300 000 / 400 000 unpaid
    expect(out.has(502)).toBe(false);
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ balance: { lt: 0 } }),
      }),
    );
  });

  it('asks nothing when no accrual is backed by a charge', async () => {
    const prisma = {
      enrollmentMonthlyCharge: { findMany: jest.fn() },
      student: { findMany: jest.fn() },
      transaction: { findMany: jest.fn() },
    };
    const out = await loadUnpaidMonthlyShare(prisma as never, 1001, [
      acc({ deductionTransactionId: null }),
    ]);
    expect(out.size).toBe(0);
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });
});

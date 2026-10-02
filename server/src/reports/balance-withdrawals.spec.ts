import { loadBalanceWithdrawals } from './balance-withdrawals';

describe('loadBalanceWithdrawals', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = { transaction: { findMany: jest.fn().mockResolvedValue([]) } };
  });

  it('sums what was withdrawn, splits the teacher credit and groups by student', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        studentId: 10001,
        amount: -200_000,
        metadata: { creditTeacher: true },
        student: { firstName: 'Ali', lastName: 'Valiyev' },
      },
      {
        studentId: 10002,
        amount: -50_000,
        metadata: { creditTeacher: false },
        student: { firstName: 'Vali', lastName: 'Aliyev' },
      },
      {
        studentId: 10002,
        amount: -300_000,
        metadata: null,
        student: { firstName: 'Vali', lastName: 'Aliyev' },
      },
    ]);

    const r = await loadBalanceWithdrawals(prisma, 1001, {
      months: ['2026-10'],
      branchIds: null,
    });

    expect(r).toEqual({
      total: 550_000,
      teacherCredited: 200_000,
      students: [
        { studentId: 10002, name: 'Vali Aliyev', amount: 350_000 },
        { studentId: 10001, name: 'Ali Valiyev', amount: 200_000 },
      ],
    });
  });

  it('reads whole Tashkent months by createdAt, scoped to the branch', async () => {
    await loadBalanceWithdrawals(prisma, 1001, {
      months: ['2026-09', '2026-10'],
      branchIds: [2],
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        type: 'BALANCE_WITHDRAWAL',
        createdAt: {
          gte: new Date('2026-08-31T19:00:00.000Z'),
          lt: new Date('2026-10-31T19:00:00.000Z'),
        },
        branchId: { in: [2] },
      },
      select: {
        studentId: true,
        amount: true,
        metadata: true,
        student: { select: { firstName: true, lastName: true } },
      },
    });
  });

  it('nets a reversal pair to nothing and drops the student', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        studentId: 10001,
        amount: -200_000,
        metadata: { creditTeacher: false },
        student: { firstName: 'Ali', lastName: 'Valiyev' },
      },
      {
        studentId: 10001,
        amount: 200_000,
        metadata: { creditTeacher: false },
        student: { firstName: 'Ali', lastName: 'Valiyev' },
      },
    ]);

    const r = await loadBalanceWithdrawals(prisma, 1001, {
      months: ['2026-10'],
      branchIds: null,
    });

    expect(r).toEqual({ total: 0, teacherCredited: 0, students: [] });
  });

  it('reads nothing for an empty scope or no months', async () => {
    const none = { total: 0, teacherCredited: 0, students: [] };
    await expect(
      loadBalanceWithdrawals(prisma, 1001, {
        months: ['2026-10'],
        branchIds: [],
      }),
    ).resolves.toEqual(none);
    await expect(
      loadBalanceWithdrawals(prisma, 1001, { months: [], branchIds: null }),
    ).resolves.toEqual(none);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });
});

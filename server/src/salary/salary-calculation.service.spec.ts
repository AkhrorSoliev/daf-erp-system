import { Test, TestingModule } from '@nestjs/testing';
import { SalaryCalculationService } from './salary-calculation.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Focused on the carry-over bucketing: the accrual sweep must use the
 * effective payroll date — COALESCE(creditPeriodDate, lessonDate) — expressed
 * as a two-branch OR so a late-payment accrual whose own lesson period is
 * closed still lands in the current run.
 */
describe('SalaryCalculationService', () => {
  let service: SalaryCalculationService;
  let prisma: any;

  // A tx client whose methods we can assert on. $transaction invokes the
  // callback with this so the SalaryPayment + accrual link happen "in-tx".
  let tx: any;

  beforeEach(async () => {
    tx = {
      salaryPayment: {
        create: jest.fn().mockResolvedValue({ id: 'sp-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      salaryAccrual: { updateMany: jest.fn().mockResolvedValue({}) },
      // applyPendingAdvances: no pending advances by default.
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    };

    prisma = {
      // null → default cycleStartDay (8) inside resolveCurrentPeriod.
      salaryPeriodSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      salaryAccrual: { findMany: jest.fn().mockResolvedValue([]) },
      // No FIXED_MONTHLY employees → skip that branch entirely.
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: { findFirst: jest.fn() },
      salaryPayment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryCalculationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalaryCalculationService>(SalaryCalculationService);
  });

  const now = new Date('2026-06-20T08:00:00.000Z');
  // With default cycleStartDay=8, the period `now` is INSIDE is [Jun 8 → Jul 7].
  // Payroll must settle the COMPLETED one before it: [May 8 → Jun 7].
  const completedStart = new Date('2026-05-07T19:00:00.000Z'); // May 8 00:00 Tashkent
  const completedEnd = new Date('2026-06-07T18:59:59.999Z'); // Jun 8 00:00 Tashkent − 1ms

  it('settles the COMPLETED period and sweeps by effective date (COALESCE(creditPeriodDate, lessonDate))', async () => {
    await service.calculateMonthlySalaries(1, now);

    expect(prisma.salaryAccrual.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 1,
          salaryPaymentId: null,
          reversedAt: null,
          OR: [
            { creditPeriodDate: { gte: completedStart, lte: completedEnd } },
            {
              creditPeriodDate: null,
              lessonDate: { gte: completedStart, lte: completedEnd },
            },
          ],
        }),
      }),
    );
  });

  it('includes a carried-over accrual alongside a normal one in the same payslip', async () => {
    // Both rows are returned by the (Prisma-side) OR filter: one normal
    // (creditPeriodDate null, lessonDate in period), one carried over
    // (creditPeriodDate in period, lessonDate in a prior closed month).
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'normal-1', userId: 7, amount: 10_000 },
      { id: 'carried-1', userId: 7, amount: 15_000 },
    ]);

    const result = await service.calculateMonthlySalaries(1, now);

    // One SalaryPayment for teacher 7, summing both accruals.
    expect(tx.salaryPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7, amount: 25_000 }),
      }),
    );
    // Both accruals linked to the new payment.
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['normal-1', 'carried-1'] } },
      data: { salaryPaymentId: 'sp-new' },
    });
    expect(result.calculated).toBe(1);
  });

  it('creates no payment when there are no accruals and no fixed-monthly staff', async () => {
    const result = await service.calculateMonthlySalaries(1, now);
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(result.calculated).toBe(0);
  });
});

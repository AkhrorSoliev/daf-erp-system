import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SalaryCalculationService } from './salary-calculation.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Covers the period resolution (cron completed vs manual asOfDate), the
 * future-period guard, and the merge-idempotency of the accrual branch
 * (create / merge-into-CALCULATED / skip-closed) so a re-run never duplicates
 * or double-pays a SalaryPayment.
 */
describe('SalaryCalculationService', () => {
  let service: SalaryCalculationService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      salaryPayment: {
        findFirst: jest.fn().mockResolvedValue(null), // no existing draft
        create: jest.fn().mockResolvedValue({ id: 'sp-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      salaryAccrual: {
        updateMany: jest.fn().mockResolvedValue({}),
        // Authoritative gross of the linked, non-reversed accruals.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      expense: {
        // applyPendingAdvances: no pending advances by default.
        findMany: jest.fn().mockResolvedValue([]),
        // already-settled advances against this payment.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    };

    prisma = {
      // null → default cycleStartDay (8) inside resolveCurrentPeriod.
      salaryPeriodSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      salaryAccrual: { findMany: jest.fn().mockResolvedValue([]) },
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
    await service.calculateMonthlySalaries(1, { now });

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

  it('manual asOfDate settles the period that date falls INSIDE (resolveCurrentPeriod, not completed)', async () => {
    // asOfDate 15.04 with cycleStartDay=8 → current period [Apr 8 → May 7],
    // distinct from the cron-completed [May 8 → Jun 7].
    const asOfDate = new Date('2026-04-15T00:00:00.000Z');
    const periodStart = new Date('2026-04-07T19:00:00.000Z'); // Apr 8 00:00 Tashkent
    const periodEnd = new Date('2026-05-07T18:59:59.999Z'); // May 8 00:00 Tashkent − 1ms

    await service.calculateMonthlySalaries(1, { asOfDate, now });

    expect(prisma.salaryAccrual.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
            {
              creditPeriodDate: null,
              lessonDate: { gte: periodStart, lte: periodEnd },
            },
          ],
        }),
      }),
    );
  });

  it('refuses to settle a period that has not finished yet', async () => {
    // asOfDate in a future month → its periodEnd is after `now`.
    const asOfDate = new Date('2026-07-15T00:00:00.000Z'); // [Jul 8 → Aug 7]
    await expect(
      service.calculateMonthlySalaries(1, { asOfDate, now }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
  });

  it('CREATES a fresh draft and links accruals when no payment exists for the period', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'normal-1', userId: 7, amount: 10_000 },
      { id: 'carried-1', userId: 7, amount: 15_000 },
    ]);
    tx.salaryAccrual.aggregate.mockResolvedValueOnce({
      _sum: { amount: 25_000 },
    });

    const result = await service.calculateMonthlySalaries(1, { now });

    // Created with amount 0; the authoritative net is written via update.
    expect(tx.salaryPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7, amount: 0 }),
      }),
    );
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['normal-1', 'carried-1'] } },
      data: { salaryPaymentId: 'sp-new' },
    });
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp-new' },
      data: { amount: 25_000 },
    });
    expect(result.calculated).toBe(1);
    expect(result.details[0].action).toBe('CREATED');
  });

  it('MERGES new accruals into an existing CALCULATED draft (no duplicate payment)', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'late-1', userId: 7, amount: 5_000 },
    ]);
    tx.salaryPayment.findFirst.mockResolvedValueOnce({
      id: 'sp-existing',
      status: 'CALCULATED',
    });
    // Existing 25k + new 5k after linking.
    tx.salaryAccrual.aggregate.mockResolvedValueOnce({
      _sum: { amount: 30_000 },
    });

    const result = await service.calculateMonthlySalaries(1, { now });

    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['late-1'] } },
      data: { salaryPaymentId: 'sp-existing' },
    });
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp-existing' },
      data: { amount: 30_000 },
    });
    expect(result.calculated).toBe(1);
    expect(result.details[0].action).toBe('MERGED');
  });

  it('SKIPS a user whose payment for the period is already APPROVED/PAID (closed)', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'x', userId: 7, amount: 5_000 },
    ]);
    tx.salaryPayment.findFirst.mockResolvedValueOnce({
      id: 'sp-paid',
      status: 'PAID',
    });

    const result = await service.calculateMonthlySalaries(1, { now });

    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
    expect(tx.salaryAccrual.updateMany).not.toHaveBeenCalled();
    expect(result.calculated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedUserIds).toEqual([7]);
  });

  it('creates no payment when there are no accruals and no fixed-monthly staff', async () => {
    const result = await service.calculateMonthlySalaries(1, { now });
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(result.calculated).toBe(0);
  });
});

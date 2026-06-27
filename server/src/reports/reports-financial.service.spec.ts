import { Test, TestingModule } from '@nestjs/testing';
import { ReportsFinancialService } from './reports-financial.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsFinancialService', () => {
  let service: ReportsFinancialService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      student: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: 0 }, _count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      salaryPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      salaryAccrual: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsFinancialService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ReportsFinancialService);
  });

  describe('getFinancialOverview', () => {
    const period = { startDate: '2026-05-01', endDate: '2026-05-31' };

    it('reports income.billed as the absolute value of the LESSON_DEDUCTION sum', async () => {
      // LESSON_DEDUCTION amounts are stored negative (they reduce balance).
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: -118894638 },
      });

      const result = await service.getFinancialOverview(1, period);

      expect(result.income.billed).toBe(118894638);
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            type: 'LESSON_DEDUCTION',
          }),
        }),
      );
    });

    it('returns income.billed = 0 when there are no LESSON_DEDUCTION rows', async () => {
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: null },
      });

      const result = await service.getFinancialOverview(1, period);

      expect(result.income.billed).toBe(0);
    });

    it('scopes the billed-lessons query to the requested branch', async () => {
      await service.getFinancialOverview(1, { ...period, branchId: 42 });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 42 }),
        }),
      );
    });

    it('nets over-charge-correction ADJUSTMENT rows into income.billed so a balance-only correction does not leave recognized revenue overstated', async () => {
      // LESSON_DEDUCTION sum still carries the phantom (double-billed) amount
      // because the correction was a lump ADJUSTMENT, not a deduction reversal.
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: -966661 },
      });
      // The #10061 cleanup: +533,328 phantom credit and a -99,999 real re-bill,
      // both marked `overcharge*`. A non-correction ADJUSTMENT must be ignored.
      prisma.transaction.findMany.mockResolvedValueOnce([
        { amount: 533328, metadata: { marker: 'overcharge-correction-10061' } },
        {
          amount: -99999,
          metadata: { marker: 'overcharge-correction-10061-v2-absent-billable' },
        },
        { amount: 200000, metadata: { marker: 'manual-balance-gift' } },
        { amount: 50000, metadata: null },
      ]);

      const result = await service.getFinancialOverview(1, period);

      // |(-966661) + (533328 - 99999)| = |-533332| = 533332. The manual gift and
      // the unmarked ADJUSTMENT are excluded.
      expect(result.income.billed).toBe(533332);
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            type: 'ADJUSTMENT',
          }),
        }),
      );
    });

    it('reclassifies TEACHER_ADVANCE expenses from expenses into salary.paid without changing the outflow total', async () => {
      // All expenses = 3,000,000 (of which 2,400,000 is teacher advances);
      // no salary run was PAID this period (the CEO paid advances instead).
      prisma.expense.aggregate.mockImplementation((args: any) => {
        if (args.where.category === 'TEACHER_ADVANCE') {
          return Promise.resolve({ _sum: { amount: 2_400_000 } });
        }
        if (args.where.category === 'MARKETING') {
          return Promise.resolve({ _sum: { amount: 0 } });
        }
        return Promise.resolve({ _sum: { amount: 3_000_000 } });
      });
      prisma.salaryPayment.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      prisma.salaryAccrual.aggregate.mockResolvedValue({
        _sum: { amount: 350_000 },
      });

      const result = await service.getFinancialOverview(1, period);

      // Advances folded into salary.paid; exposed separately for the sub-line.
      expect(result.salary.paid).toBe(2_400_000);
      expect(result.salary.advances).toBe(2_400_000);
      expect(result.salary.pending).toBe(350_000);
      // Expenses bucket no longer contains the advances.
      expect(result.expenses).toBe(600_000);
      // Total outflow (and therefore netProfit) is unchanged: income 0 −
      // (600,000 expenses + 2,400,000 salary) = −3,000,000, same as the old
      // (3,000,000 expenses + 0 salary).
      expect(result.netProfit).toBe(-3_000_000);
    });

    it('scopes the teacher-advance query to TEACHER_ADVANCE and the branch', async () => {
      await service.getFinancialOverview(1, { ...period, branchId: 42 });

      expect(prisma.expense.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            category: 'TEACHER_ADVANCE',
            branchId: 42,
          }),
        }),
      );
    });
  });
});

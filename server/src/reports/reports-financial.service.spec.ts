import { Test, TestingModule } from '@nestjs/testing';
import { ReportsFinancialService } from './reports-financial.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsFinancialService', () => {
  let service: ReportsFinancialService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-01-01') }),
      },
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

    // Helper: mock the four expense.aggregate calls (all / advance-paid /
    // advance-settled / marketing) by inspecting the `where`.
    const mockExpenses = (opts: {
      all: number;
      advancePaid: number;
      advanceSettled: number;
    }) => {
      prisma.expense.aggregate.mockImplementation((args: any) => {
        const w = args.where;
        if (w.category === 'TEACHER_ADVANCE' && w.settledBySalaryPayment) {
          return Promise.resolve({ _sum: { amount: opts.advanceSettled } });
        }
        if (w.category === 'TEACHER_ADVANCE') {
          return Promise.resolve({ _sum: { amount: opts.advancePaid } });
        }
        if (w.category === 'MARKETING') {
          return Promise.resolve({ _sum: { amount: 0 } });
        }
        return Promise.resolve({ _sum: { amount: opts.all } });
      });
    };

    it('excludes an UNSETTLED advance from Xarajatlar, salary AND Foyda (it is a prepayment, not a Chiqim yet)', async () => {
      // All expenses = 3,000,000 (of which 2,400,000 is advance cash paid this
      // period); none of it is settled yet, and no salary run was PAID.
      mockExpenses({ all: 3_000_000, advancePaid: 2_400_000, advanceSettled: 0 });
      prisma.salaryPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.salaryAccrual.aggregate.mockResolvedValue({
        _sum: { amount: 350_000 },
      });

      const result = await service.getFinancialOverview(1, period);

      // Advance pulled out of Xarajatlar (avanssiz)…
      expect(result.expenses).toBe(600_000);
      // …but NOT added to salary (it is not settled) — so the "shundan avans"
      // sub-line and salary.paid are both 0 this period.
      expect(result.salary.paid).toBe(0);
      expect(result.salary.advances).toBe(0);
      expect(result.salary.pending).toBe(350_000);
      // The 2,400,000 advance is in NEITHER bucket → outflow is only 600,000.
      // Foyda: income 0 − 600,000 = −600,000 (NOT −3,000,000).
      expect(result.netProfit).toBe(-600_000);
    });

    it('recognizes a SETTLED advance as salary cost in the period its salary run is paid', async () => {
      // No advance cash paid this period, but a prior advance of 2,400,000
      // settled against a salary run paid now (net cash paid = 100,000).
      mockExpenses({ all: 600_000, advancePaid: 0, advanceSettled: 2_400_000 });
      prisma.salaryPayment.aggregate.mockResolvedValue({
        _sum: { amount: 100_000 },
      });
      prisma.salaryAccrual.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

      const result = await service.getFinancialOverview(1, period);

      expect(result.expenses).toBe(600_000);
      // Gross salary = net paid 100,000 + settled advance 2,400,000.
      expect(result.salary.paid).toBe(2_500_000);
      expect(result.salary.advances).toBe(2_400_000);
      // Outflow = 600,000 + 2,500,000 → Foyda = −3,100,000.
      expect(result.netProfit).toBe(-3_100_000);
    });

    it('scopes the advance-paid query to TEACHER_ADVANCE + branch and the settled query to a PAID salary run', async () => {
      await service.getFinancialOverview(1, { ...period, branchId: 42 });

      // Advance-paid (netted out of Xarajatlar) — by expense date + branch.
      expect(prisma.expense.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            category: 'TEACHER_ADVANCE',
            branchId: 42,
          }),
        }),
      );
      // Advance-settled (recognized as salary) — gated on a PAID SalaryPayment.
      expect(prisma.expense.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'TEACHER_ADVANCE',
            settledBySalaryPayment: expect.objectContaining({ status: 'PAID' }),
          }),
        }),
      );
    });
  });

  describe('getYearlyTrend', () => {
    it('buckets by calendar year with the same avanssiz split as the monthly trend', async () => {
      prisma.company.findUnique.mockResolvedValue({
        systemStartDate: new Date('2026-01-01'),
      });
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 1_000_000 },
        _count: 4,
      });
      // General expense = 200k; both TEACHER_ADVANCE queries = 0 (no advances).
      prisma.expense.aggregate.mockImplementation((args: any) =>
        Promise.resolve({
          _sum: {
            amount: args?.where?.category === 'TEACHER_ADVANCE' ? 0 : 200_000,
          },
        }),
      );
      prisma.salaryPayment.aggregate.mockResolvedValue({
        _sum: { amount: 300_000 },
      });
      prisma.student.count.mockResolvedValue(10);
      prisma.payment.groupBy.mockResolvedValue([
        { studentId: 1 },
        { studentId: 2 },
      ]);

      const res = await service.getYearlyTrend(1);

      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThanOrEqual(1);
      const y = res[res.length - 1];
      expect(y.year).toBe(new Date().getFullYear());
      expect(y.income).toBe(1_000_000);
      // expenses = 200k − advancePaid(0) + salary(300k) + advanceSettled(0)
      expect(y.expenses).toBe(500_000);
      expect(y.profit).toBe(500_000);
      expect(y.newStudents).toBe(10);
      expect(y.payerCount).toBe(2);
    });

    it('caps the block to at most the 5 most recent years', async () => {
      prisma.company.findUnique.mockResolvedValue({
        systemStartDate: new Date('2000-01-01'),
      });
      const res = await service.getYearlyTrend(1);
      expect(res.length).toBeLessThanOrEqual(5);
    });
  });
});

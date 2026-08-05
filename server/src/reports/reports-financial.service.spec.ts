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
      // Feeds `getRecognizedRevenue`, which `getIncomeMonthAttribution` now
      // calls for the collection denominator. Empty by default so the existing
      // attribution cases keep their `transaction.findMany` mock order (the
      // recognized-revenue walk short-circuits before its consumption query).
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
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
      await service.getFinancialOverview(1, { ...period, branchIds: [42] });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: { in: [42] } }),
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
      await service.getFinancialOverview(1, { ...period, branchIds: [42] });

      // Advance-paid (netted out of Xarajatlar) — by expense date + branch.
      expect(prisma.expense.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            category: 'TEACHER_ADVANCE',
            branchId: { in: [42] },
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

      const res = await service.getYearlyTrend(1, null);

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

  describe('getMonthlyDebtRecovery', () => {
    beforeEach(() => {
      // Single month (systemStartDate = today → floor = current month), so the
      // number of enumerated months is deterministic (1).
      prisma.company.findUnique.mockResolvedValue({
        systemStartDate: new Date(),
      });
      prisma.student.findMany = jest.fn();
      prisma.transaction.groupBy = jest.fn();
    });

    it('reconstructs month-end debt from any-status negative balances and caps recovery at each cohort debt', async () => {
      // Student 1 owes 200k, student 2 has credit (+50k, not a debtor),
      // student 3 owes 100k → closingDebt 300k across 2 debtors.
      prisma.student.findMany.mockResolvedValue([
        { id: 1, balance: -200000 },
        { id: 2, balance: 50000 },
        { id: 3, balance: -100000 },
      ]);
      prisma.transaction.groupBy
        // movesAfter (no ledger movement after month-end in this scenario)
        .mockResolvedValueOnce([])
        // PAYMENT recovery after month-end: student 1 paid 80k, student 3 paid 0
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 80000 } }])
        // DEBT_WRITE_OFF: none
        .mockResolvedValueOnce([]);

      const res = await service.getMonthlyDebtRecovery(1);

      expect(res.months).toHaveLength(1);
      const m = res.months[0];
      expect(m.closingDebt).toBe(300000);
      expect(m.debtorCount).toBe(2);
      expect(m.recovered).toBe(80000);
      expect(m.writtenOff).toBe(0);
      expect(m.remaining).toBe(220000);
      // Both debtors still owe after partial/no recovery → 2 remain.
      expect(m.remainingDebtorCount).toBe(2);
      // 80000 / 300000 = 26.666… → 26.7%
      expect(m.recoveryRate).toBe(26.7);
      expect(res.totals).toEqual({
        closingDebt: 300000,
        recovered: 80000,
        writtenOff: 0,
        remaining: 220000,
      });
    });

    it('caps recovery at the cohort debt even if later payments exceed it (oldest-first)', async () => {
      // Student owed 200k at month-end but paid 300k afterwards (250k of it went
      // to NEW debt). May-cohort recovery is capped at 200k, remaining 0.
      prisma.student.findMany.mockResolvedValue([{ id: 1, balance: -250000 }]);
      prisma.transaction.groupBy
        .mockResolvedValueOnce([]) // movesAfter
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 300000 } }]) // PAYMENT
        .mockResolvedValueOnce([]); // DEBT_WRITE_OFF

      const res = await service.getMonthlyDebtRecovery(1);
      const m = res.months[0];
      expect(m.closingDebt).toBe(250000);
      expect(m.recovered).toBe(250000); // min(250k debt, 300k paid)
      expect(m.remaining).toBe(0);
    });

    it('reconstructs a PAST month-end balance by subtracting later ledger movement', async () => {
      // Live balance is 0, but 150k of PAYMENT landed AFTER month-end, so the
      // month-end balance was −150k (a debtor that has since been fully paid).
      prisma.student.findMany.mockResolvedValue([{ id: 1, balance: 0 }]);
      prisma.transaction.groupBy
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 150000 } }]) // movesAfter (a payment)
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 150000 } }]) // PAYMENT recovery
        .mockResolvedValueOnce([]); // DEBT_WRITE_OFF

      const res = await service.getMonthlyDebtRecovery(1);
      const m = res.months[0];
      expect(m.closingDebt).toBe(150000); // reconstructed, not the live 0
      expect(m.debtorCount).toBe(1);
      expect(m.recovered).toBe(150000);
      expect(m.remaining).toBe(0);
      // Fully recovered → nobody from that cohort still owes.
      expect(m.remainingDebtorCount).toBe(0);
      expect(m.recoveryRate).toBe(100);
    });
  });

  describe('getMonthDebtDetail', () => {
    beforeEach(() => {
      prisma.student.findMany = jest.fn();
      prisma.transaction.groupBy = jest.fn();
      prisma.transaction.findMany = jest.fn();
    });

    it('returns the per-student cohort + payment/write-off lists and foots to the aggregate', async () => {
      // Cohort: student 1 owed 200k at month-end, paid 80k since → remaining 120k.
      prisma.student.findMany
        // (1) balances for reconstruction
        .mockResolvedValueOnce([
          { id: 1, balance: -200000 },
          { id: 2, balance: 50000 },
        ])
        // (2) name/phone/group enrichment for the cohort
        .mockResolvedValueOnce([
          {
            id: 1,
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901234567',
            enrollments: [{ group: { name: 'A1-01' } }],
          },
        ]);
      prisma.transaction.groupBy
        .mockResolvedValueOnce([]) // movesAfter
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 80000 } }]) // PAYMENT
        .mockResolvedValueOnce([]); // DEBT_WRITE_OFF
      prisma.transaction.findMany
        // payRows (recovered payments)
        .mockResolvedValueOnce([
          {
            id: 'p1',
            studentId: 1,
            amount: 80000,
            createdAt: new Date('2026-07-05'),
            student: { firstName: 'Ali', lastName: 'Valiyev' },
            performedBy: { firstName: 'Admin', lastName: 'X' },
            payment: { method: 'CASH' },
          },
        ])
        // woRows (write-offs)
        .mockResolvedValueOnce([]);

      const res = await service.getMonthDebtDetail(1, '2026-06');

      expect(res.totals).toEqual({
        closingDebt: 200000,
        recovered: 80000,
        writtenOff: 0,
        remaining: 120000,
        debtorCount: 1,
      });
      // Detail foots to the aggregate.
      expect(res.debtors.reduce((s, d) => s + d.monthEndDebt, 0)).toBe(
        res.totals.closingDebt,
      );
      expect(res.debtors).toHaveLength(1);
      expect(res.debtors[0]).toEqual(
        expect.objectContaining({
          id: 1,
          firstName: 'Ali',
          phone: '901234567',
          groups: ['A1-01'],
          monthEndDebt: 200000,
          recovered: 80000,
          remaining: 120000,
        }),
      );
      expect(res.recoveredPayments).toHaveLength(1);
      expect(res.recoveredPayments[0]).toEqual(
        expect.objectContaining({
          amount: 80000,
          method: 'CASH',
          performedBy: 'Admin X',
        }),
      );
      expect(res.writeOffs).toHaveLength(0);
      expect(res.truncated).toBe(false);
    });

    it('short-circuits (no enrichment / list queries) when the month has no debtors', async () => {
      prisma.student.findMany.mockResolvedValueOnce([{ id: 1, balance: 5000 }]);
      prisma.transaction.groupBy.mockResolvedValueOnce([]); // movesAfter → no negatives

      const res = await service.getMonthDebtDetail(1, '2026-06');

      expect(res.debtors).toEqual([]);
      expect(res.totals.debtorCount).toBe(0);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPeriodOutflows', () => {
    const period = { startDate: '2026-06-01', endDate: '2026-06-30' };

    it('returns |Σ refunds|, |Σ write-offs| and Σ gateway fees', async () => {
      // REFUND rows are negative on the student ledger.
      prisma.transaction.findMany.mockResolvedValueOnce([
        { amount: -500_000 },
        { amount: -407_000 },
      ]);
      // DEBT_WRITE_OFF credits the student balance (positive).
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: 1_465_986 },
      });
      prisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { providerFee: 12_000 },
      });

      const r = await service.getPeriodOutflows(1, period);

      expect(r.refunds).toBe(907_000);
      expect(r.writeOffs).toBe(1_465_986);
      expect(r.providerFees).toBe(12_000);
    });

    it('defaults to zero when nothing happened in the period', async () => {
      const r = await service.getPeriodOutflows(1, period);
      expect(r).toMatchObject({ refunds: 0, writeOffs: 0, providerFees: 0 });
    });

    it('filters refunds/write-offs to non-reversed rows and scopes gateway fees by branch', async () => {
      await service.getPeriodOutflows(1, { ...period, branchIds: [7] });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'REFUND',
            reversedAt: null,
          }),
        }),
      );
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'DEBT_WRITE_OFF',
            reversedAt: null,
          }),
        }),
      );
      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: { in: [7] } }),
        }),
      );
    });
  });

  describe('getIncomeMonthAttribution', () => {
    const period = { startDate: '2026-06-01', endDate: '2026-06-30' };

    it('splits period income into real (current month) vs late (prior months) FIFO, oldest-first', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10001 }]);
      // Effective ledger, chronological. Two prior-month debits, a May payment
      // that partially settles April OUT of the period (consumes silently), then
      // two June payments that get attributed.
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10001,
          type: 'LESSON_DEDUCTION',
          amount: -300000,
          branchId: null,
          createdAt: new Date('2026-04-10T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 100000, // May — out of period, settles 100k of April silently
          branchId: null,
          createdAt: new Date('2026-05-05T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'LESSON_DEDUCTION',
          amount: -200000,
          branchId: null,
          createdAt: new Date('2026-05-10T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 700000, // June — clears April(200k)+May(200k), 300k current
          branchId: null,
          createdAt: new Date('2026-06-15T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 100000, // June — no outstanding debt → all current
          branchId: null,
          createdAt: new Date('2026-06-20T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.monthKey).toBe('2026-06');
      expect(result.currentMonth).toBe(400000); // 300k leftover + 100k fresh
      expect(result.lateTotal).toBe(400000);
      expect(result.late).toEqual([
        { monthKey: '2026-05', label: 'May 2026', amount: 200000 },
        { monthKey: '2026-04', label: 'Aprel 2026', amount: 200000 },
      ]);
      // Reconciles exactly with the two in-period PAYMENT amounts (700k + 100k).
      expect(result.total).toBe(800000);
      expect(result.total).toBe(result.currentMonth + result.lateTotal);
      expect(result.payerCount).toBe(1);
    });

    it('returns an empty breakdown when nobody paid in the period', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.total).toBe(0);
      expect(result.currentMonth).toBe(0);
      expect(result.late).toEqual([]);
      expect(result.payerCount).toBe(0);
      // No ledger replay needed when there are no payers.
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });

    it('only tallies payments from the requested branch (other-branch credits still age the debt)', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10002 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10002,
          type: 'LESSON_DEDUCTION',
          amount: -500000,
          branchId: null,
          createdAt: new Date('2026-05-10T00:00:00Z'),
        },
        {
          studentId: 10002,
          type: 'PAYMENT',
          amount: 200000, // wrong branch — consumes 200k of May debt silently
          branchId: 9,
          createdAt: new Date('2026-06-12T00:00:00Z'),
        },
        {
          studentId: 10002,
          type: 'PAYMENT',
          amount: 400000, // branch 5 — clears remaining 300k May, 100k current
          branchId: 5,
          createdAt: new Date('2026-06-18T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, {
        ...period,
        branchIds: [5],
      });

      expect(result.total).toBe(400000); // only the branch-5 payment
      expect(result.lateTotal).toBe(300000);
      expect(result.currentMonth).toBe(100000);
      expect(result.late).toEqual([
        { monthKey: '2026-05', label: 'May 2026', amount: 300000 },
      ]);
    });

    it('treats an on-time PREPAID payment as current income, not "late" for the prior month', async () => {
      // Prepaid-by-default billing: pay a full cycle up front, the
      // LESSON_DEDUCTION follows. The balance is NEVER negative, so a June
      // payment must land in `currentMonth` even though a May deduction preceded
      // it (the advance covered it).
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10003 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10003,
          type: 'PAYMENT',
          amount: 240000, // May advance — out of period
          branchId: null,
          createdAt: new Date('2026-05-25T00:00:00Z'),
        },
        {
          studentId: 10003,
          type: 'LESSON_DEDUCTION',
          amount: -240000, // absorbed by the standing advance, no obligation
          branchId: null,
          createdAt: new Date('2026-05-27T00:00:00Z'),
        },
        {
          studentId: 10003,
          type: 'PAYMENT',
          amount: 240000, // June — on-time, balance was never negative
          branchId: null,
          createdAt: new Date('2026-06-05T00:00:00Z'),
        },
        {
          studentId: 10003,
          type: 'LESSON_DEDUCTION',
          amount: -240000,
          branchId: null,
          createdAt: new Date('2026-06-07T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.currentMonth).toBe(240000);
      expect(result.lateTotal).toBe(0);
      expect(result.late).toEqual([]);
      expect(result.total).toBe(240000);
    });

    it('does not fabricate "late" from a BALANCE_WITHDRAWAL that drains a positive balance', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10004 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10004,
          type: 'PAYMENT',
          amount: 500000, // in period
          branchId: null,
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
        {
          studentId: 10004,
          type: 'BALANCE_WITHDRAWAL',
          amount: -200000, // drains standing advance — never an obligation
          branchId: null,
          createdAt: new Date('2026-06-03T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.currentMonth).toBe(500000);
      expect(result.late).toEqual([]);
      expect(result.total).toBe(500000);
    });

    it('labels a multi-month range span, not a single month', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      const result = await service.getIncomeMonthAttribution(1, {
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      });

      expect(result.currentLabel).toBe('Yanvar 2026 – Iyun 2026');
    });

    it('divides the period\'s OWN income by the value of lessons held in it', async () => {
      // Two lessons held in June, billed 150 000 each -> denominator 300 000.
      prisma.attendance.findMany.mockResolvedValueOnce([
        { id: 'a1', group: { course: { price: 1800000, lessonPaymentCount: 12 } } },
        { id: 'a2', group: { course: { price: 1800000, lessonPaymentCount: 12 } } },
      ]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        { attendanceId: 'a1', metadata: { perLessonCost: 150000 } },
        { attendanceId: 'a2', metadata: { perLessonCost: 150000 } },
      ]);
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10001 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 150000,
          branchId: null,
          createdAt: new Date('2026-06-10T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.lessonsValue).toBe(300000);
      expect(result.currentMonth).toBe(150000);
      expect(result.collectionPct).toBe(50);
    });

    it('excludes old-debt settlement from the ratio (that is the point of it)', async () => {
      prisma.attendance.findMany.mockResolvedValueOnce([
        { id: 'a1', group: { course: { price: 1200000, lessonPaymentCount: 12 } } },
      ]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        { attendanceId: 'a1', metadata: { perLessonCost: 100000 } },
      ]);
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10001 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10001,
          type: 'LESSON_DEDUCTION',
          amount: -500000, // May debt
          branchId: null,
          createdAt: new Date('2026-05-10T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 500000, // June cash, but it only clears the May debt
          branchId: null,
          createdAt: new Date('2026-06-10T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      // Half a million came in, yet NOTHING was collected for June's own
      // lesson — the old `cash ÷ forecast` line would have reported this month
      // as a triumph.
      expect(result.total).toBe(500000);
      expect(result.lateTotal).toBe(500000);
      expect(result.collectionPct).toBe(0);
    });

    it('reports a null ratio when no lesson was held (never divides by zero)', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.lessonsValue).toBe(0);
      expect(result.collectionPct).toBeNull();
    });
  });

  describe('getRecognizedRevenue', () => {
    const window = {
      start: new Date('2026-06-01'),
      end: new Date('2026-07-01'),
    };

    it('confines attendance to the caller scope', async () => {
      // Regression: the signature destructured `branchId` while both callers
      // passed `branchIds`, so the predicate was always `undefined` — a
      // branch-filtered Foyda card subtracted ONE branch's payroll from the
      // WHOLE company's revenue.
      await service.getRecognizedRevenue(1, { ...window, branchIds: [7] });

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ group: { branchId: { in: [7] } } }),
        }),
      );
    });

    it('returns 0 for an empty scope rather than the whole company', async () => {
      const result = await service.getRecognizedRevenue(1, {
        ...window,
        branchIds: [],
      });

      expect(result).toBe(0);
      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it('applies no branch predicate for an unrestricted caller', async () => {
      await service.getRecognizedRevenue(1, { ...window, branchIds: null });

      const arg = prisma.attendance.findMany.mock.calls[0][0];
      expect(arg.where.group).toBeUndefined();
    });
  });
});

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
      // Oylik model: `LESSON_CONSUMPTION` yozilmagan darsning muzlatilgan
      // narxi shu yerdan keladi. Bo'sh — mavjud testlar 12 talik yo'lda.
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
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
    const period = {
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      // Every branch — what these assertions already measured when the
      // argument was silently `undefined`.
      branchIds: null,
    };

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
      mockExpenses({
        all: 3_000_000,
        advancePaid: 2_400_000,
        advanceSettled: 0,
      });
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

    // ADR-0059: the debt is the split's — `ReportsService.getDebtSplit`, which
    // the facade folds in as `debtSplit`. This raw read used to carry a second
    // copy: a status-ACTIVE receivable (`forecast.outstandingReceivable`), its
    // count (`debtorExposure`) and a third read of the same count (`debtorCount`).
    // That copy let an ungrouped «faol» student into «qarzdorlar» while every
    // other surface left him out.
    it('carries no debt figure and issues no debtor read', async () => {
      const result: any = await service.getFinancialOverview(1, period);

      expect(result).not.toHaveProperty('forecast');
      expect(result).not.toHaveProperty('debtorCount');

      const debtReads = [
        ...prisma.student.aggregate.mock.calls,
        ...prisma.student.count.mock.calls,
      ]
        .map(([args]: [any]) => args.where)
        .filter((where: any) => where.balance !== undefined);
      expect(debtReads).toEqual([]);
    });

    it("still reads the active students' balance and the new-student count", async () => {
      await service.getFinancialOverview(1, period);

      // `activeBalance` / `activeStudentCount` are not debt figures: they stay.
      expect(prisma.student.aggregate).toHaveBeenCalledTimes(1);
      expect(prisma.student.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1, status: 'ACTIVE' }),
          _sum: { balance: true },
        }),
      );
      expect(prisma.student.count).toHaveBeenCalledTimes(1);
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

  describe('getFinancialTrend', () => {
    // 01.10.2026 01:30 in Tashkent. Production runs in UTC, where the process
    // calendar still says 30.09 — the months used to be built there.
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:30:00.000Z'));
    });
    afterEach(() => jest.useRealTimers());

    const span = (f: { gte: Date; lt?: Date }) =>
      `${f.gte.toISOString()}..${f.lt?.toISOString()}`;
    const spans = (filters: { gte: Date; lt?: Date }[]) =>
      [...new Set(filters.map(span))].sort();

    it('ends the six-month series on the current Tashkent month', async () => {
      const res = await service.getFinancialTrend(1, null);

      expect(res.map((r) => r.monthKey)).toEqual([
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
      expect(res.map((r) => r.month)).toEqual([
        '05/2026',
        '06/2026',
        '07/2026',
        '08/2026',
        '09/2026',
        '10/2026',
      ]);
    });

    it('bounds every timestamp leg by Tashkent midnights, so a payment at 00:30 on the 1st counts in its own month', async () => {
      await service.getFinancialTrend(1, null);

      const filters = [
        ...prisma.payment.aggregate.mock.calls.map(
          ([a]: any) => a.where.createdAt,
        ),
        ...prisma.payment.groupBy.mock.calls.map(
          ([a]: any) => a.where.createdAt,
        ),
        ...prisma.student.count.mock.calls.map(([a]: any) => a.where.createdAt),
        ...prisma.salaryPayment.aggregate.mock.calls.map(
          ([a]: any) => a.where.paidAt,
        ),
        ...prisma.expense.aggregate.mock.calls
          .filter(([a]: any) => a.where.settledBySalaryPayment)
          .map(([a]: any) => a.where.settledBySalaryPayment.paidAt),
      ];
      // 01.10 00:30 Tashkent is 2026-09-30T19:30Z: inside the last window only.
      expect(spans(filters)).toEqual([
        '2026-04-30T19:00:00.000Z..2026-05-31T19:00:00.000Z',
        '2026-05-31T19:00:00.000Z..2026-06-30T19:00:00.000Z',
        '2026-06-30T19:00:00.000Z..2026-07-31T19:00:00.000Z',
        '2026-07-31T19:00:00.000Z..2026-08-31T19:00:00.000Z',
        '2026-08-31T19:00:00.000Z..2026-09-30T19:00:00.000Z',
        '2026-09-30T19:00:00.000Z..2026-10-31T19:00:00.000Z',
      ]);
    });

    it('bounds the Expense.date legs (@db.Date) by plain calendar dates, not Tashkent-shifted instants', async () => {
      await service.getFinancialTrend(1, null);

      const filters = prisma.expense.aggregate.mock.calls
        .filter(([a]: any) => a.where.date)
        .map(([a]: any) => a.where.date);
      // Postgres truncates a timestamp to its UTC date against a `date`
      // column: a 2026-09-30T19:00Z bound would pull 30.09 into October.
      expect(spans(filters)).toEqual([
        '2026-05-01T00:00:00.000Z..2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z..2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z..2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z..2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z..2026-10-01T00:00:00.000Z',
        '2026-10-01T00:00:00.000Z..2026-11-01T00:00:00.000Z',
      ]);
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
      const res = await service.getYearlyTrend(1, null);
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

      const res = await service.getMonthlyDebtRecovery(1, null);

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

      const res = await service.getMonthlyDebtRecovery(1, null);
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

      const res = await service.getMonthlyDebtRecovery(1, null);
      const m = res.months[0];
      expect(m.closingDebt).toBe(150000); // reconstructed, not the live 0
      expect(m.debtorCount).toBe(1);
      expect(m.recovered).toBe(150000);
      expect(m.remaining).toBe(0);
      // Fully recovered → nobody from that cohort still owes.
      expect(m.remainingDebtorCount).toBe(0);
      expect(m.recoveryRate).toBe(100);
    });

    it('sums only write-offs still in force after month-end; the balance walk and the payment tally keep every row (A2.9)', async () => {
      // A cancelled write-off is two rows — the original (`reversedAt`) and a
      // counter-row (`reversedTransactionId`) — and neither is forgiveness.
      // The month-end balance and the payments are different: both halves of a
      // pair net out there, so those reads must stay unfiltered.
      prisma.student.findMany.mockResolvedValue([{ id: 1, balance: -100000 }]);
      prisma.transaction.groupBy.mockResolvedValue([]);

      await service.getMonthlyDebtRecovery(1, null);

      const wheres = prisma.transaction.groupBy.mock.calls.map(
        ([args]: any[]) => args.where,
      );
      const writeOffs = wheres.filter((w: any) => w.type === 'DEBT_WRITE_OFF');
      expect(writeOffs).toHaveLength(1);
      expect(writeOffs[0]).toMatchObject({
        reversedAt: null,
        reversedTransactionId: null,
      });
      for (const w of wheres.filter((w: any) => w.type !== 'DEBT_WRITE_OFF')) {
        expect(w).not.toHaveProperty('reversedAt');
        expect(w).not.toHaveProperty('reversedTransactionId');
      }
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
        .mockResolvedValueOnce([]) // DEBT_WRITE_OFF
        // headcounts: distinct payers / forgiven students
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 80000 } }])
        .mockResolvedValueOnce([]);
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

      const res = await service.getMonthDebtDetail(1, '2026-06', null);

      expect(res.totals).toEqual({
        closingDebt: 200000,
        recovered: 80000,
        writtenOff: 0,
        remaining: 120000,
        debtorCount: 1,
        // The cohort still owes 200k TODAY even though 80k of the June debt
        // was recovered — `remaining` and `debtNow` are different questions and
        // the drill-down must show both.
        debtNow: 200000,
        debtorsNow: 1,
        // ONE person paid, via ONE payment row — the two are counted apart so
        // the UI never renders a row count beside a headcount.
        payerCount: 1,
        forgivenCount: 0,
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

    it('keeps BOTH halves of a reversed payment so the list foots to the aggregate', async () => {
      // `reverseTransaction` writes the counter-row with the ORIGINAL's type
      // and `reversedAt: null`. Filtering `reversedAt: null` therefore dropped
      // the payment and KEPT its undo, leaving bare negative rows in the list —
      // 6 of them in May 2026 alone, and the list stopped summing to the
      // aggregate above it (201.5 mln shown against 202.8 mln tallied).
      prisma.student.findMany
        .mockResolvedValueOnce([{ id: 1, balance: -200000 }])
        .mockResolvedValueOnce([
          {
            id: 1,
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: null,
            enrollments: [],
          },
        ]);
      prisma.transaction.groupBy
        .mockResolvedValueOnce([]) // movesAfter
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 0 } }]) // PAYMENT nets to 0
        .mockResolvedValueOnce([]) // DEBT_WRITE_OFF
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 0 } }]) // payers
        .mockResolvedValueOnce([]); // forgiven
      prisma.transaction.findMany
        .mockResolvedValueOnce([
          {
            id: 'rev',
            studentId: 1,
            amount: -80000,
            createdAt: new Date('2026-07-06'),
            reversedAt: null,
            reversedTransactionId: 'p1',
            student: { firstName: 'Ali', lastName: 'Valiyev' },
            performedBy: null,
            payment: null,
          },
          {
            id: 'p1',
            studentId: 1,
            amount: 80000,
            createdAt: new Date('2026-07-05'),
            reversedAt: new Date('2026-07-06'),
            reversedTransactionId: null,
            student: { firstName: 'Ali', lastName: 'Valiyev' },
            performedBy: null,
            payment: { method: 'CASH' },
          },
        ])
        .mockResolvedValueOnce([]);

      const res = await service.getMonthDebtDetail(1, '2026-06', null);

      // The query must NOT carry a reversal filter.
      const payWhere = prisma.transaction.findMany.mock.calls[0][0].where;
      expect(payWhere).not.toHaveProperty('reversedAt');

      expect(res.recoveredPayments).toHaveLength(2);
      expect(res.recoveredPayments.reduce((s, p) => s + p.amount, 0)).toBe(
        res.totals.recovered,
      );
      expect(res.recoveredPayments.find((p) => p.id === 'p1')?.isReversed).toBe(
        true,
      );
      expect(
        res.recoveredPayments.find((p) => p.id === 'rev')?.isReversal,
      ).toBe(true);
    });

    it('claims a write-off BEFORE payment so forgiveness is never squeezed out', async () => {
      // Both compete for the same capped debt. The write-off is an explicit act
      // naming this debt; the payment attribution is inferred from oldest-first
      // settlement, so the explicit one wins. The other order reported 2.43 mln
      // so'm of real write-offs as 0.43 mln.
      prisma.student.findMany
        .mockResolvedValueOnce([{ id: 1, balance: -100000 }])
        .mockResolvedValueOnce([
          {
            id: 1,
            firstName: 'Ali',
            lastName: 'V',
            phone: null,
            enrollments: [],
          },
        ]);
      prisma.transaction.groupBy
        .mockResolvedValueOnce([]) // movesAfter → debt 100k
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 100000 } }]) // paid enough to absorb the cap
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 40000 } }]) // …and 40k was forgiven
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 100000 } }]) // payers
        .mockResolvedValueOnce([{ studentId: 1, _sum: { amount: 40000 } }]); // forgiven
      prisma.transaction.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await service.getMonthDebtDetail(1, '2026-06', null);

      expect(res.totals.writtenOff).toBe(40000);
      expect(res.totals.recovered).toBe(60000);
      expect(res.totals.remaining).toBe(0);
    });

    it('lists and counts only write-offs still in force — a cancelled one is not «Kechirildi» (A2.9)', async () => {
      prisma.student.findMany
        .mockResolvedValueOnce([{ id: 1, balance: -200000 }])
        .mockResolvedValueOnce([
          {
            id: 1,
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: null,
            enrollments: [],
          },
        ]);
      prisma.transaction.groupBy.mockResolvedValue([]);
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.getMonthDebtDetail(1, '2026-06', null);

      const writeOffWheres = (mock: jest.Mock) =>
        mock.mock.calls
          .map(([args]: any[]) => args.where)
          .filter((w: any) => w.type === 'DEBT_WRITE_OFF');
      // Two grouped sums — the cohort's `writtenOff` and `forgivenCount` — and
      // the list itself.
      const sums = writeOffWheres(prisma.transaction.groupBy);
      const list = writeOffWheres(prisma.transaction.findMany);
      expect(sums).toHaveLength(2);
      expect(list).toHaveLength(1);
      for (const w of [...sums, ...list]) {
        expect(w).toMatchObject({
          reversedAt: null,
          reversedTransactionId: null,
        });
      }
    });

    it('short-circuits (no enrichment / list queries) when the month has no debtors', async () => {
      prisma.student.findMany.mockResolvedValueOnce([{ id: 1, balance: 5000 }]);
      prisma.transaction.groupBy.mockResolvedValueOnce([]); // movesAfter → no negatives

      const res = await service.getMonthDebtDetail(1, '2026-06', null);

      expect(res.debtors).toEqual([]);
      expect(res.totals.debtorCount).toBe(0);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPeriodOutflows', () => {
    const period = {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      branchIds: null,
    };

    it('returns Σ refunds as cash returned, Σ write-offs and Σ gateway fees', async () => {
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

    it('filters refunds/write-offs to live rows (both reversal columns) and scopes gateway fees by branch', async () => {
      await service.getPeriodOutflows(1, { ...period, branchIds: [7] });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'REFUND',
            reversedAt: null,
            reversedTransactionId: null,
          }),
        }),
      );
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'DEBT_WRITE_OFF',
            reversedAt: null,
            reversedTransactionId: null,
          }),
        }),
      );
      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: { in: [7] } }),
        }),
      );
    });

    // Cancelling a refund or a write-off writes TWO rows of the SAME type: the
    // original is stamped `reversedAt`, the counter-row carries
    // `reversedTransactionId` and has `reversedAt: null`. This stand-in applies
    // the two reversal columns of the `where` the service sends, so a read that
    // forgets one of them gets back the row it should have left out.
    type LedgerRow = {
      amount: number;
      reversedAt: Date | null;
      reversedTransactionId: string | null;
    };
    const liveRows = (rows: LedgerRow[], { where }: any) =>
      rows.filter(
        (r) =>
          (!('reversedAt' in where) || r.reversedAt === where.reversedAt) &&
          (!('reversedTransactionId' in where) ||
            r.reversedTransactionId === where.reversedTransactionId),
      );
    const cancelledAt = new Date('2026-06-12T10:00:00Z');

    it('a cancelled refund is not money out: neither the cancelled original nor its counter-row counts', async () => {
      const rows: LedgerRow[] = [
        { amount: -100_000, reversedAt: null, reversedTransactionId: null }, // live refund
        {
          amount: -300_000,
          reversedAt: cancelledAt,
          reversedTransactionId: null,
        }, // cancelled original
        { amount: 300_000, reversedAt: null, reversedTransactionId: 'rf-1' }, // its counter-row
      ];
      prisma.transaction.findMany.mockImplementation(async (args: any) =>
        liveRows(rows, args).map(({ amount }) => ({ amount })),
      );

      const r = await service.getPeriodOutflows(1, period);

      expect(r.refunds).toBe(100_000);
    });

    it('a cancelled write-off is not a loss: neither the cancelled original nor its counter-row counts', async () => {
      const rows: LedgerRow[] = [
        { amount: 500_000, reversedAt: null, reversedTransactionId: null }, // live write-off
        {
          amount: 300_000,
          reversedAt: cancelledAt,
          reversedTransactionId: null,
        }, // cancelled original
        { amount: -300_000, reversedAt: null, reversedTransactionId: 'wo-1' }, // its counter-row
      ];
      prisma.transaction.aggregate.mockImplementation(async (args: any) => ({
        _sum: {
          amount: liveRows(rows, args).reduce((s, row) => s + row.amount, 0),
        },
      }));

      const r = await service.getPeriodOutflows(1, period);

      expect(r.writeOffs).toBe(500_000);
    });

    it('turns a refund total into cash returned without Math.abs, so a wrong-signed sum stays visible', async () => {
      prisma.transaction.findMany.mockResolvedValueOnce([{ amount: -300_000 }]);
      expect((await service.getPeriodOutflows(1, period)).refunds).toBe(
        300_000,
      );

      // Cannot happen once counter-rows are left out — if it ever does, it must
      // read as a negative refund, not be flipped into a real one.
      prisma.transaction.findMany.mockResolvedValueOnce([{ amount: 50_000 }]);
      expect((await service.getPeriodOutflows(1, period)).refunds).toBe(
        -50_000,
      );
    });

    it('reads the write-off total as the signed Σ (a write-off credits the student, so it is positive), never through Math.abs', async () => {
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: 300_000 },
      });
      expect((await service.getPeriodOutflows(1, period)).writeOffs).toBe(
        300_000,
      );

      // A negative total can only be a counter-row that leaked in; it must stay
      // negative instead of being flipped into a loss.
      prisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: -50_000 },
      });
      expect((await service.getPeriodOutflows(1, period)).writeOffs).toBe(
        -50_000,
      );
    });
  });

  describe('getIncomeMonthAttribution', () => {
    const period = {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      branchIds: null,
    };

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
        branchIds: null,
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      });

      expect(result.currentLabel).toBe('Yanvar 2026 – Iyun 2026');
    });

    it("divides the period's OWN income by the value of lessons held in it", async () => {
      // Two lessons held in June, billed 150 000 each -> denominator 300 000.
      prisma.attendance.findMany.mockResolvedValueOnce([
        {
          id: 'a1',
          // Every attendance row has these; the pricing reads the date.
          studentId: 10001,
          groupId: 'g1',
          date: new Date('2026-06-10T00:00:00Z'),
          group: { course: { price: 1800000, lessonPaymentCount: 12 } },
        },
        {
          id: 'a2',
          // Every attendance row has these; the pricing reads the date.
          studentId: 10001,
          groupId: 'g1',
          date: new Date('2026-06-10T00:00:00Z'),
          group: { course: { price: 1800000, lessonPaymentCount: 12 } },
        },
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
        {
          id: 'a1',
          studentId: 10001,
          groupId: 'g1',
          date: new Date('2026-06-10T00:00:00Z'),
          group: { course: { price: 1200000, lessonPaymentCount: 12 } },
        },
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

    // I1 — oylik yo'l `LESSON_CONSUMPTION` yozmaydi. Busiz oylik o'quvchining
    // har bir darsi nolga hisoblanardi, o'qituvchi haqi esa hisoblanaverardi:
    // «Sof foyda» 01.09 dan boshlab soxta ZARAR ko'rsatardi.
    it('recognizes a monthly lesson from the frozen EnrollmentMonthlyCharge', async () => {
      prisma.attendance.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          studentId: 10001,
          groupId: 'g1',
          date: new Date('2026-06-10T00:00:00Z'),
          group: { course: { price: 450_000, lessonPaymentCount: 12 } },
        },
        {
          id: 'att-2',
          studentId: 10002,
          groupId: 'g1',
          date: new Date('2026-06-10T00:00:00Z'),
          group: { course: { price: 450_000, lessonPaymentCount: 12 } },
        },
      ]);
      // Oylik yo'lda dars-boshiga qator yo'q.
      prisma.transaction.findMany.mockResolvedValueOnce([]);
      // #10001 ning iyun hisobi yozilgan; #10002 niki emas.
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValueOnce([
        {
          studentId: 10001,
          groupId: 'g1',
          periodYear: 2026,
          periodMonth: 6,
          perLessonCost: 34_615,
        },
      ]);

      const result = await service.getRecognizedRevenue(1, {
        ...window,
        branchIds: null,
      });

      // Faqat hisobi bor dars tan olinadi; hisobsizi avvalgidek 0.
      expect(result).toBe(34_615);
      // 12 talik formulasi (450 000/12 = 37 500) ISHLATILMAYDI.
      expect(result).not.toBe(37_500);
    });

    // Production 2026-09: the switch to monthly billing re-billed September on
    // the monthly price but left that month's 12-pack LESSON_CONSUMPTION
    // markers. Reading the marker first valued ~3 700 lessons at 37 500 while
    // the teacher's pay for them had been re-accrued at the monthly price.
    it('prices a lesson its monthly charge billed at the monthly price, not the old pack marker', async () => {
      prisma.attendance.findMany.mockResolvedValueOnce([
        {
          id: 'att-billed',
          studentId: 10001,
          groupId: 'g1',
          date: new Date('2026-06-10T00:00:00Z'),
          group: {
            branchId: 1,
            course: {
              name: 'Standart',
              price: 450_000,
              lessonPaymentCount: 12,
            },
          },
        },
        {
          id: 'att-before',
          studentId: 10001,
          groupId: 'g1',
          date: new Date('2026-06-03T00:00:00Z'),
          group: {
            branchId: 1,
            course: {
              name: 'Standart',
              price: 450_000,
              lessonPaymentCount: 12,
            },
          },
        },
      ]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        { attendanceId: 'att-billed', metadata: { perLessonCost: 37_500 } },
        { attendanceId: 'att-before', metadata: { perLessonCost: 37_500 } },
      ]);
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValueOnce([
        {
          studentId: 10001,
          groupId: 'g1',
          periodYear: 2026,
          periodMonth: 6,
          perLessonCost: 34_615,
          plannedLessons: 13,
          // The charge started after the 3rd: that lesson stays the pack's.
          coveredDates: ['2026-06-10'],
          frozenOutDates: [],
        },
      ]);

      const lessons = await service.valueHeldLessons(1, {
        ...window,
        branchIds: null,
      });

      expect(lessons.map((l) => [l.attendanceId, l.value])).toEqual([
        ['att-billed', 34_615],
        ['att-before', 37_500],
      ]);
      expect(lessons[0]).toEqual(
        expect.objectContaining({
          branchId: 1,
          courseName: 'Standart',
          dateStr: '2026-06-10',
        }),
      );
    });
  });

  describe('getDebtWriteOffsSummary', () => {
    it('sums only write-offs still in effect — never the undo counter-rows', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 250_000 },
        _count: 2,
      });

      const res = await service.getDebtWriteOffsSummary(1001, {
        branchIds: [1],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(prisma.transaction.aggregate.mock.calls[0][0].where).toMatchObject(
        {
          companyId: 1001,
          type: 'DEBT_WRITE_OFF',
          reversedAt: null,
          reversedTransactionId: null,
          branchId: { in: [1] },
        },
      );
      expect(res).toMatchObject({ totalAmount: 250_000, count: 2 });
    });
  });
});

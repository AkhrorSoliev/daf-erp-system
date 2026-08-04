import { Test, TestingModule } from '@nestjs/testing';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsExpectationService } from './reports-expectation.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { RedisService } from '../redis/redis.service';

/**
 * Structural guard: when a branch scope is given, EVERY query a money report
 * issues must carry a branch predicate.
 *
 * Asserting `Σ(branches) === company total` on real data is the business rule,
 * but it cannot be unit-tested against a mocked Prisma — the mock returns
 * whatever it is told. What CAN be tested, and is what actually broke, is that
 * no query is left unfiltered. `getFinancialOverview` scoped ten of its queries
 * by branch and silently ignored the scope on the other four, so selecting the
 * empty Namangan branch reported 27 748 684 so'm of debt across 177 debtors —
 * all of them Fargona's — while the debtors PAGE, which does filter, showed 0.
 *
 * A new unscoped query fails here the moment it is added.
 */

/** The three shapes a branch predicate can take, by where the branch lives. */
function hasBranchPredicate(where: any): boolean {
  if (!where || typeof where !== 'object') return false;
  // On the row itself (Payment, Expense, Transaction).
  if (where.branchId !== undefined) return true;
  // On the StudentBranch join (Student has no branchId column).
  if (where.branches !== undefined) return true;
  // On the employee (SalaryPayment / SalaryAccrual carry no branch at all).
  if (where.user !== undefined) return true;
  // Through a joined row that carries it (accruals via their group).
  if (where.group?.branchId !== undefined) return true;
  return false;
}

describe('branch scope coverage', () => {
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
        groupBy: jest.fn().mockResolvedValue([]),
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

  /** Every `where` passed to any mocked Prisma method this test run. */
  function everyWhereClause(): { model: string; method: string; where: any }[] {
    const out: { model: string; method: string; where: any }[] = [];
    for (const [model, methods] of Object.entries(prisma)) {
      for (const [method, fn] of Object.entries(methods as any)) {
        for (const call of (fn as jest.Mock).mock.calls) {
          // `company.findUnique` looks up the reporting floor by id, not by
          // branch — it is configuration, not money.
          if (model === 'company') continue;
          out.push({ model, method, where: call[0]?.where });
        }
      }
    }
    return out;
  }

  const period = { startDate: '2026-05-01', endDate: '2026-05-31' };

  it('getFinancialOverview scopes EVERY query when a branch is selected', async () => {
    await service.getFinancialOverview(1, { ...period, branchIds: [2] });

    const unscoped = everyWhereClause().filter(
      (c) => !hasBranchPredicate(c.where),
    );
    expect(
      unscoped.map((c) => `${c.model}.${c.method}`),
    ).toEqual([]);
  });

  it('getFinancialOverview leaves every query UNfiltered for a company-wide caller', async () => {
    // The mirror image: a CEO with no branch picked must not gain a stray
    // predicate that would quietly drop branch-less legacy rows.
    await service.getFinancialOverview(1, { ...period, branchIds: null });

    const scoped = everyWhereClause().filter((c) => hasBranchPredicate(c.where));
    expect(scoped.map((c) => `${c.model}.${c.method}`)).toEqual([]);
  });

  it('getPeriodOutflows scopes refunds, write-offs AND gateway fees', async () => {
    await service.getPeriodOutflows(1, { ...period, branchIds: [2] });

    const unscoped = everyWhereClause().filter(
      (c) => !hasBranchPredicate(c.where),
    );
    expect(unscoped.map((c) => `${c.model}.${c.method}`)).toEqual([]);
  });

  it('getReconciliation scopes all three roll-forward legs together', async () => {
    // If the legs disagreed the footing would break: closing (balances) minus
    // activity (their ledger rows) must reconcile within the SAME scope.
    await service.getReconciliation(1, { ...period, branchIds: [2] });

    const unscoped = everyWhereClause().filter(
      (c) => !hasBranchPredicate(c.where),
    );
    expect(unscoped.map((c) => `${c.model}.${c.method}`)).toEqual([]);
  });

  it('getFinancialTrend scopes the count legs, not just the money legs', async () => {
    // H17: money came from the branch, new-student and payer COUNTS from the
    // whole company — so an empty branch plotted 0 so'm beside 715 students.
    await service.getFinancialTrend(1, [2]);

    const unscoped = everyWhereClause().filter(
      (c) => !hasBranchPredicate(c.where),
    );
    expect(unscoped.map((c) => `${c.model}.${c.method}`)).toEqual([]);
  });

  it('getYearlyTrend scopes the count legs too', async () => {
    await service.getYearlyTrend(1, [2]);

    const unscoped = everyWhereClause().filter(
      (c) => !hasBranchPredicate(c.where),
    );
    expect(unscoped.map((c) => `${c.model}.${c.method}`)).toEqual([]);
  });

  it('an empty scope compiles to a predicate that matches NOTHING', async () => {
    // A confined caller with no branch must see zeros, never the company. The
    // controller refuses them first, but the service must not fail open either.
    await service.getFinancialOverview(1, { ...period, branchIds: [] });

    const wheres = everyWhereClause();
    expect(wheres.length).toBeGreaterThan(0);
    for (const { model, method, where } of wheres) {
      expect({
        q: `${model}.${method}`,
        scoped: hasBranchPredicate(where),
      }).toEqual({ q: `${model}.${method}`, scoped: true });
    }
  });
});

/**
 * The expectation service is guarded separately because its scoping is a
 * CHAIN, not a per-query predicate: only the group query carries `branchId`,
 * and the attendance/consumption queries inherit it by filtering on the ids
 * that query returned. The generic `hasBranchPredicate` helper above cannot
 * see that, so the chain itself is what gets asserted here.
 */
describe('branch scope coverage — expectation service', () => {
  let service: ReportsExpectationService;
  let prisma: any;

  const scopedGroup = {
    id: 'g-in-scope',
    exactDays: ['monday'],
    startDate: null,
    endDate: null,
    scheduleSnapshots: [],
    course: { price: 1_200_000, lessonPaymentCount: 12 },
    contracts: [],
    enrollments: [{ studentId: 10001, student: { discountPercent: 0 } }],
  };

  beforeEach(async () => {
    prisma = {
      group: { findMany: jest.fn().mockResolvedValue([scopedGroup]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsExpectationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: HolidaysService,
          useValue: {
            buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
          },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ReportsExpectationService);
  });

  it('scopes the group and cancellation queries, and chains the rest to them', async () => {
    await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: [7],
    });

    expect(prisma.group.findMany.mock.calls[0][0].where.branchId).toEqual({
      in: [7],
    });
    expect(
      prisma.lessonCancellation.findMany.mock.calls[0][0].where.group.branchId,
    ).toEqual({ in: [7] });
    // The chain: attendance sees ONLY the ids the scoped group query returned.
    expect(prisma.attendance.findMany.mock.calls[0][0].where.groupId).toEqual({
      in: ['g-in-scope'],
    });
  });

  it('leaves every query unfiltered for a company-wide caller', async () => {
    await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    expect(
      prisma.group.findMany.mock.calls[0][0].where.branchId,
    ).toBeUndefined();
    expect(
      prisma.lessonCancellation.findMany.mock.calls[0][0].where.group.branchId,
    ).toBeUndefined();
  });

  it('an empty scope reads NOTHING at all', async () => {
    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: [],
    });

    expect(r.expectedValue).toBe(0);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });
});

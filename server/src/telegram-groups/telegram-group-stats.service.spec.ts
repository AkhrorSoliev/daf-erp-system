import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { studyingDebtorWhere, type DebtSplit } from '../reports/debt-split';
import { TelegramGroupStatsService } from './telegram-group-stats.service';
import { TelegramGroupDailyReportService } from './telegram-group-daily-report.service';
import { formatNumber, formatSum } from './utils/format.util';

describe('TelegramGroupStatsService', () => {
  let service: TelegramGroupStatsService;
  const build = jest.fn();
  // The debt is `ReportsService.getDebtSplit`'s (ADR-0059).
  const getDebtSplit = jest.fn();
  const NOBODY_OWES: DebtSplit = {
    studying: {
      total: 0,
      count: 0,
      currentMonth: 0,
      older: 0,
      olderCount: 0,
    },
    notStudying: {
      total: 0,
      count: 0,
      byKind: {
        ungrouped: { total: 0, count: 0 },
        frozen: { total: 0, count: 0 },
        left: { total: 0, count: 0 },
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    getDebtSplit.mockResolvedValue(NOBODY_OWES);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupStatsService,
        { provide: PrismaService, useValue: {} },
        { provide: TelegramGroupDailyReportService, useValue: { build } },
        { provide: ReportsService, useValue: { getDebtSplit } },
      ],
    }).compile();
    service = module.get(TelegramGroupStatsService);
  });

  /**
   * No `student.aggregate`: the totals come from the split, so a command that
   * reads them from `Student` itself throws here. `findMany` is the top-five
   * list and answers `debtorRows`.
   */
  function makePrisma(debtorRows: unknown[] = []) {
    const resolve = <T>(v: T) => jest.fn(() => Promise.resolve(v));
    return {
      role: { findFirst: resolve({ id: 4 }) },
      student: {
        count: resolve(0),
        findMany: resolve(debtorRows),
      },
      group: { count: resolve(0) },
      user: { count: resolve(0) },
      payment: {
        aggregate: resolve({ _sum: { amount: 0 }, _count: 0 }),
        groupBy: resolve([]),
      },
      expense: { aggregate: resolve({ _sum: { amount: 0 } }) },
    } as any;
  }
  async function svcWith(prisma: any) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupStatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramGroupDailyReportService, useValue: { build } },
        { provide: ReportsService, useValue: { getDebtSplit } },
      ],
    }).compile();
    return module.get(TelegramGroupStatsService);
  }

  describe('buildDailyReport — delegates to the daily-report service', () => {
    it('returns only the composed message (no snapshot side-effect on /hisobot)', async () => {
      build.mockResolvedValue({
        message: 'kunlik hisobot',
        snapshot: {
          totalDebt: 1,
          debtorCount: 1,
          activeStudents: 1,
          mtdIncome: 1,
        },
      });

      const out = await service.buildDailyReport(1001, null);

      expect(build).toHaveBeenCalledWith(1001, null);
      expect(out).toBe('kunlik hisobot');
    });
  });

  describe('buildOverallStats — MTD expense boundary', () => {
    beforeEach(() =>
      jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z')),
    );
    afterEach(() => jest.useRealTimers());

    it('bounds the /stats Expense query by a date-only Tashkent month window, not a -5h shifted timestamp (regression)', async () => {
      const prisma = makePrisma();
      const svc = await svcWith(prisma);

      await svc.buildOverallStats(1001, null);

      const where = prisma.expense.aggregate.mock.calls[0][0].where;
      // Lower bound = 1st of the Tashkent month at 00:00 UTC (not the buggy
      // 19:00-of-the-previous-30th that leaked June into July).
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.gte.getUTCHours()).toBe(0);
      expect(where.date.gte.getUTCDate()).toBe(1);
      expect(where.date.gte.getUTCMonth()).toBe(6); // July
      // Upper bound now exists (was missing → future-dated leak).
      expect(where.date.lte).toBeInstanceOf(Date);
      expect(where.date.lte.getUTCHours()).toBe(0);
    });
  });

  // Every /stats figure used to be company-wide, so a group tied to one branch
  // was answered with both branches' students, payments and debtors. Each model
  // needs a DIFFERENT predicate, which is what makes this worth pinning: a
  // `branchId` on Student or a `branches.some` on Payment would both compile
  // and both be wrong.
  describe('branch scope reaches every model with the right predicate', () => {
    it('slices Student through the StudentBranch join, not a branchId column', async () => {
      const prisma = makePrisma();
      await (await svcWith(prisma)).buildStudentsBlock(1001, [2]);

      for (const call of prisma.student.count.mock.calls) {
        expect(call[0].where.branches).toEqual({
          some: { branchId: { in: [2] } },
        });
        expect(call[0].where.branchId).toBeUndefined();
      }
    });

    it('slices the debtor list AND its totals the same way', async () => {
      const prisma = makePrisma();
      await (await svcWith(prisma)).buildDebtorsBlock(1001, [1]);

      // The totals are the split's, asked for this group's own scope; the named
      // top five must be cut by the same branch predicate, or the bot prints
      // five Fargona debtors under a company-wide sum.
      expect(getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: [1] });
      const list = prisma.student.findMany.mock.calls[0][0].where;
      expect(list.branches).toEqual({ some: { branchId: { in: [1] } } });
    });

    it('slices Payment by its own branchId column', async () => {
      const prisma = makePrisma();
      await (await svcWith(prisma)).buildPaymentsBlock(1001, [2]);

      expect(prisma.payment.aggregate.mock.calls[0][0].where.branchId).toEqual({
        in: [2],
      });
      expect(prisma.payment.groupBy.mock.calls[0][0].where.branchId).toEqual({
        in: [2],
      });
    });

    it('slices User through mainBranch OR the UserBranch join', async () => {
      const prisma = makePrisma();
      await (await svcWith(prisma)).buildTeachersBlock(1001, [1]);

      const where = prisma.user.count.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { mainBranch: { in: [1] } },
        { branches: { some: { branchId: { in: [1] } } } },
      ]);
    });

    it('adds no predicate at all for an org-wide group', async () => {
      const prisma = makePrisma();
      await (await svcWith(prisma)).buildStudentsBlock(1001, null);

      for (const call of prisma.student.count.mock.calls) {
        expect(call[0].where.branches).toBeUndefined();
        expect(call[0].where.branchId).toBeUndefined();
      }
    });
  });

  // ADR-0059: the debt is TWO numbers that are never added — «O'qiyotganlar»
  // (a student in an active group) and «O'qimayotganlar» (every other
  // non-archived debtor). Both commands print the 21:00 report's lines
  // (`buildDebtSplitLines`), shu oy / eski qarz line included, without the
  // report's bullets: neither command uses any.
  describe('debt as two numbers (ADR-0059)', () => {
    const split: DebtSplit = {
      studying: {
        total: 39_150_000,
        count: 219,
        currentMonth: 36_990_000,
        older: 2_160_000,
        olderCount: 13,
      },
      notStudying: {
        total: 36_540_000,
        count: 305,
        byKind: {
          ungrouped: { total: 13_500_000, count: 118 },
          frozen: { total: 13_140_000, count: 91 },
          left: { total: 9_900_000, count: 96 },
        },
      },
    };
    const debtors = [
      { id: 10001, firstName: 'Ali', lastName: 'Valiyev', balance: -3_100_000 },
      { id: 10002, firstName: 'Vali', lastName: 'Aliyev', balance: -2_800_000 },
      {
        id: 10003,
        firstName: 'Guli',
        lastName: 'Karimova',
        balance: -2_500_000,
      },
      {
        id: 10004,
        firstName: 'Sami',
        lastName: 'Rashidov',
        balance: -2_200_000,
      },
      {
        id: 10005,
        firstName: 'Nilu',
        lastName: 'Hasanova',
        balance: -1_900_000,
      },
    ];

    beforeEach(() => getDebtSplit.mockResolvedValue(split));

    // `formatSum` / `formatNumber`, not literals: their thousands separator is
    // a non-breaking space. One contiguous block checks wording and order.
    const debtBlock = [
      `O'qiyotganlar qarzi: <b>${formatNumber(219)}</b> ta — <b>${formatSum(39_150_000)}</b>`,
      `   🟡 shu oy ${formatSum(36_990_000)} · 🔴 eski qarz ${formatSum(2_160_000)}`,
      `O'qimayotganlar qarzi: <b>${formatNumber(305)}</b> ta — <b>${formatSum(36_540_000)}</b>`,
    ].join('\n');

    it('/qarzdorlar prints both totals, then the five largest studying debtors', async () => {
      const prisma = makePrisma(debtors);

      const text = await (await svcWith(prisma)).buildDebtorsBlock(1001, null);

      expect(text).toContain(debtBlock);
      // The command keeps its own look: no bullets.
      expect(text).not.toContain('• ');
      expect(text).toContain("<b>Eng katta 5 ta qarzdor (o'qiyotganlar):</b>");
      expect(text).toContain(
        `  1. Ali Valiyev (#10001) — <b>${formatSum(3_100_000)}</b>`,
      );
      expect(text).toContain(
        `  5. Nilu Hasanova (#10005) — <b>${formatSum(1_900_000)}</b>`,
      );
      // The single combined total is gone, and the two are never added.
      expect(text).not.toContain('Jami qarz');
      expect(text).not.toContain('Soni:');
      expect(text).not.toContain(formatNumber(39_150_000 + 36_540_000));
    });

    it("lists the debtors by the split's own studying predicate, biggest debt first, ties by id", async () => {
      const prisma = makePrisma(debtors);

      await (await svcWith(prisma)).buildDebtorsBlock(1001, null);

      // `studyingDebtorWhere` is the predicate `loadDebtSplit` reads the
      // studying total with, so the list is part of the number above it. The
      // id breaks a tie on balance, so the five are the same five every time.
      expect(prisma.student.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.student.findMany).toHaveBeenCalledWith({
        where: studyingDebtorWhere(1001, null),
        orderBy: [{ balance: 'asc' }, { id: 'asc' }],
        take: 5,
        select: { id: true, firstName: true, lastName: true, balance: true },
      });
      expect(getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: null });
    });

    it('/qarzdorlar names nobody when no studying student owes, but still prints both numbers', async () => {
      getDebtSplit.mockResolvedValue({
        studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
        notStudying: { total: 36_540_000, count: 305 },
      });

      const text = await (
        await svcWith(makePrisma())
      ).buildDebtorsBlock(1001, null);

      expect(text).toContain(
        `O'qiyotganlar qarzi: <b>${formatNumber(0)}</b> ta — <b>${formatSum(0)}</b>`,
      );
      expect(text).toContain(
        `O'qimayotganlar qarzi: <b>${formatNumber(305)}</b> ta — <b>${formatSum(36_540_000)}</b>`,
      );
      expect(text).not.toContain('Eng katta');
      // Nothing studying is owed, so there is no split to print.
      expect(text).not.toContain('shu oy');
    });

    it("/stats prints the 21:00 report's debt lines in place of «Qarzdorlar»", async () => {
      const text = await (
        await svcWith(makePrisma())
      ).buildOverallStats(1001, [2]);

      expect(text).toContain(debtBlock);
      expect(text).not.toContain('• ');
      expect(text).not.toContain('Qarzdorlar');
      expect(text).not.toContain(formatNumber(39_150_000 + 36_540_000));
      expect(getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: [2] });
    });
  });
});

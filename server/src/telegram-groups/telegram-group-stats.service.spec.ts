import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupStatsService } from './telegram-group-stats.service';
import { TelegramGroupDailyReportService } from './telegram-group-daily-report.service';

describe('TelegramGroupStatsService', () => {
  let service: TelegramGroupStatsService;
  const build = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupStatsService,
        { provide: PrismaService, useValue: {} },
        { provide: TelegramGroupDailyReportService, useValue: { build } },
      ],
    }).compile();
    service = module.get(TelegramGroupStatsService);
  });

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
      const prisma: any = {
        role: { findFirst: jest.fn(async () => ({ id: 4 })) },
        student: {
          count: jest.fn(async () => 0),
          aggregate: jest.fn(async () => ({ _sum: { balance: 0 }, _count: 0 })),
        },
        group: { count: jest.fn(async () => 0) },
        user: { count: jest.fn(async () => 0) },
        payment: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })) },
        expense: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramGroupStatsService,
          { provide: PrismaService, useValue: prisma },
          { provide: TelegramGroupDailyReportService, useValue: { build } },
        ],
      }).compile();
      const svc = module.get(TelegramGroupStatsService);

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
    function makePrisma() {
      const resolve = <T>(v: T) => jest.fn(() => Promise.resolve(v));
      return {
        role: { findFirst: resolve({ id: 4 }) },
        student: {
          count: resolve(0),
          aggregate: resolve({ _sum: { balance: 0 }, _count: 0 }),
          findMany: resolve([]),
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
        ],
      }).compile();
      return module.get(TelegramGroupStatsService);
    }

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

    it('slices the debtor list AND its total the same way', async () => {
      const prisma = makePrisma();
      await (await svcWith(prisma)).buildDebtorsBlock(1001, [1]);

      const agg = prisma.student.aggregate.mock.calls[0][0].where;
      const list = prisma.student.findMany.mock.calls[0][0].where;
      // The named top-5 and the total they belong to must agree, or the bot
      // prints five Fargona debtors under a company-wide sum.
      expect(agg.branches).toEqual({ some: { branchId: { in: [1] } } });
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
});

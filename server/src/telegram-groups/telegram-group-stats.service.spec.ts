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

      const out = await service.buildDailyReport(1001);

      expect(build).toHaveBeenCalledWith(1001);
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

      await svc.buildOverallStats(1001);

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
});

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
});

import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupDailyCronService } from './telegram-group-daily-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupStatsService } from './telegram-group-stats.service';
import { HolidaysService } from '../holidays/holidays.service';

describe('TelegramGroupDailyCronService', () => {
  let service: TelegramGroupDailyCronService;
  const sendMessage = jest.fn();
  const bot = { telegram: { sendMessage } };
  const getBot = jest.fn(() => bot as any);
  const buildDailyReport = jest.fn();
  const findActiveHolidayCovering = jest.fn();
  const prisma = {
    telegramGroup: { findMany: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    getBot.mockReturnValue(bot as any);
    findActiveHolidayCovering.mockResolvedValue(null);
    // Pin "now" to a known weekday (2026-05-18 = Monday in Tashkent) so the
    // Sunday-skip guard never triggers in the non-Sunday tests below.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-18T12:00:00Z'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupDailyCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramAdminBotService, useValue: { getBot } },
        {
          provide: TelegramGroupStatsService,
          useValue: { buildDailyReport },
        },
        {
          provide: HolidaysService,
          useValue: { findActiveHolidayCovering },
        },
      ],
    }).compile();
    service = module.get(TelegramGroupDailyCronService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips the cron entirely on a Sunday — no holiday lookup, no report sent', async () => {
    // 2026-05-24 is a Sunday in Asia/Tashkent.
    jest.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    await service.sendDailyReports();
    expect(findActiveHolidayCovering).not.toHaveBeenCalled();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("skips the cron entirely on a holiday — no DB query, no report sent", async () => {
    findActiveHolidayCovering.mockResolvedValue({
      id: 'h-1',
      name: "Navro'z",
      date: new Date('2026-03-21'),
      endDate: new Date('2026-03-23'),
    });
    await service.sendDailyReports();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
    expect(buildDailyReport).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('runs normally on a non-holiday day', async () => {
    findActiveHolidayCovering.mockResolvedValue(null);
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001 },
    ]);
    buildDailyReport.mockResolvedValue('daily report');
    prisma.telegramGroup.update.mockResolvedValue({});

    await service.sendDailyReports();

    expect(buildDailyReport).toHaveBeenCalledWith(1001);
    expect(sendMessage).toHaveBeenCalledWith('111', 'daily report', {
      parse_mode: 'HTML',
    });
    expect(prisma.telegramGroup.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { lastDailyReportAt: expect.any(Date) },
    });
  });

  it('does nothing when the admin bot is not initialized', async () => {
    getBot.mockReturnValue(null);
    await service.sendDailyReports();
    expect(findActiveHolidayCovering).not.toHaveBeenCalled();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
  });
});

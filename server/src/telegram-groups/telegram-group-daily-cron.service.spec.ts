import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupDailyCronService } from './telegram-group-daily-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupDailyReportService } from './telegram-group-daily-report.service';
import { HolidaysService } from '../holidays/holidays.service';

describe('TelegramGroupDailyCronService', () => {
  let service: TelegramGroupDailyCronService;
  const sendMessage = jest.fn();
  const bot = { telegram: { sendMessage } };
  const getBot = jest.fn(() => bot as any);
  const build = jest.fn();
  const persistSnapshot = jest.fn();
  const findActiveHolidayCovering = jest.fn();
  const prisma = {
    telegramGroup: { findMany: jest.fn(), update: jest.fn() },
  };

  const sampleSnapshot = {
    totalDebt: 100,
    debtorCount: 2,
    activeStudents: 50,
    mtdIncome: 1000,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    getBot.mockReturnValue(bot as any);
    findActiveHolidayCovering.mockResolvedValue(null);
    persistSnapshot.mockResolvedValue(undefined);
    // Pin "now" to a known weekday (2026-05-18 = Monday in Tashkent) so the
    // Sunday-skip guard never triggers in the non-Sunday tests below.
    jest.useFakeTimers().setSystemTime(new Date('2026-05-18T12:00:00Z'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupDailyCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramAdminBotService, useValue: { getBot } },
        {
          provide: TelegramGroupDailyReportService,
          useValue: { build, persistSnapshot },
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

  it('skips the cron entirely on a holiday — no DB query, no report sent', async () => {
    findActiveHolidayCovering.mockResolvedValue({
      id: 'h-1',
      name: "Navro'z",
      date: new Date('2026-03-21'),
      endDate: new Date('2026-03-23'),
    });
    await service.sendDailyReports();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('runs normally on a non-holiday day', async () => {
    findActiveHolidayCovering.mockResolvedValue(null);
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001 },
    ]);
    build.mockResolvedValue({ message: 'daily report', snapshot: sampleSnapshot });
    prisma.telegramGroup.update.mockResolvedValue({});

    await service.sendDailyReports();

    expect(build).toHaveBeenCalledWith(1001);
    expect(sendMessage).toHaveBeenCalledWith(
      '111',
      'daily report',
      expect.objectContaining({ parse_mode: 'HTML', reply_markup: expect.anything() }),
    );
    expect(prisma.telegramGroup.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { lastDailyReportAt: expect.any(Date) },
    });
    // The snapshot is NOT written from here any more — DailySnapshotCron owns
    // it, so Sundays and holidays (when this cron does not run) still get a row.
    expect(persistSnapshot).not.toHaveBeenCalled();
  });

  it('builds once per company and reuses it across that company’s groups', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001 },
      { id: 'g2', chatId: 222n, companyId: 1001 },
    ]);
    build.mockResolvedValue({ message: 'daily report', snapshot: sampleSnapshot });
    prisma.telegramGroup.update.mockResolvedValue({});

    await service.sendDailyReports();

    // One build for the shared company, two sends, snapshot persisted per send.
    expect(build).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(persistSnapshot).not.toHaveBeenCalled();
  });

  it('does not persist a snapshot when the send fails', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001 },
    ]);
    build.mockResolvedValue({ message: 'daily report', snapshot: sampleSnapshot });
    sendMessage.mockRejectedValueOnce(new Error('network'));

    await service.sendDailyReports();

    expect(persistSnapshot).not.toHaveBeenCalled();
    expect(prisma.telegramGroup.update).not.toHaveBeenCalled();
  });

  it('does nothing when the admin bot is not initialized', async () => {
    getBot.mockReturnValue(null);
    await service.sendDailyReports();
    expect(findActiveHolidayCovering).not.toHaveBeenCalled();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
  });
});

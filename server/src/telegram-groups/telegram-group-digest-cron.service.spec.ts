import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupDigestCronService } from './telegram-group-digest-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { DigestEntry } from './telegram-group-digest-buffer.service';

describe('TelegramGroupDigestCronService', () => {
  let service: TelegramGroupDigestCronService;
  const sendMessage = jest.fn();
  const bot = { telegram: { sendMessage } };
  const getBot = jest.fn(() => bot as any);
  const drain = jest.fn();
  const build = jest.fn();
  const findActiveHolidayCovering = jest.fn();
  const prisma = {
    telegramGroup: { findMany: jest.fn(), update: jest.fn() },
    company: { findMany: jest.fn() },
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
        TelegramGroupDigestCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramAdminBotService, useValue: { getBot } },
        { provide: TelegramGroupDigestBufferService, useValue: { drain } },
        { provide: TelegramGroupDigestService, useValue: { build } },
        {
          provide: require('../holidays/holidays.service').HolidaysService,
          useValue: { findActiveHolidayCovering },
        },
      ],
    }).compile();
    service = module.get(TelegramGroupDigestCronService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const studentEntry = (branchId: number | null): DigestEntry => ({
    kind: 'student',
    at: '2026-05-21T09:00:00.000Z',
    branchId,
    studentId: 1,
    name: 'A B',
  });

  it('skips the entire flush on a Sunday — no holiday lookup, no digest sent', async () => {
    // 2026-05-24 is a Sunday in Asia/Tashkent.
    jest.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    await service.flushDigests();
    expect(findActiveHolidayCovering).not.toHaveBeenCalled();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('skips the entire flush on a holiday — no DB query, no digest sent', async () => {
    findActiveHolidayCovering.mockResolvedValue({
      id: 'h-1',
      name: "Navro'z",
      date: new Date('2026-03-21'),
      endDate: new Date('2026-03-23'),
    });
    await service.flushDigests();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the admin bot is not initialized', async () => {
    getBot.mockReturnValue(null);
    await service.flushDigests();
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it('does nothing when there are no approved groups', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([]);
    await service.flushDigests();
    expect(drain).not.toHaveBeenCalled();
  });

  it('skips companies with an empty buffer', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001, branchId: null },
    ]);
    prisma.company.findMany.mockResolvedValue([{ id: 1001, name: 'DaF' }]);
    drain.mockResolvedValue([]);
    await service.flushDigests();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends one digest message per group', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001, branchId: null },
    ]);
    prisma.company.findMany.mockResolvedValue([{ id: 1001, name: 'DaF' }]);
    drain.mockResolvedValue([studentEntry(1)]);
    build.mockReturnValue('digest message');
    await service.flushDigests();
    expect(sendMessage).toHaveBeenCalledWith('111', 'digest message', {
      parse_mode: 'HTML',
    });
  });

  it('shows a branch-scoped group only its own branch events', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'wide', chatId: 100n, companyId: 1001, branchId: null },
      { id: 'br5', chatId: 200n, companyId: 1001, branchId: 5 },
    ]);
    prisma.company.findMany.mockResolvedValue([{ id: 1001, name: 'DaF' }]);
    drain.mockResolvedValue([studentEntry(5), studentEntry(9)]);
    build.mockReturnValue('msg');
    await service.flushDigests();

    // Company-wide group: both entries.
    const wideCall = build.mock.calls.find(
      (c) => (c[1] as DigestEntry[]).length === 2,
    );
    expect(wideCall).toBeDefined();
    // Branch-5 group: only the branch-5 entry.
    const branchCall = build.mock.calls.find(
      (c) =>
        (c[1] as DigestEntry[]).length === 1 &&
        (c[1] as DigestEntry[])[0].branchId === 5,
    );
    expect(branchCall).toBeDefined();
  });

  it('marks a group inactive when the bot was kicked (403)', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([
      { id: 'g1', chatId: 111n, companyId: 1001, branchId: null },
    ]);
    prisma.company.findMany.mockResolvedValue([{ id: 1001, name: 'DaF' }]);
    drain.mockResolvedValue([studentEntry(1)]);
    build.mockReturnValue('msg');
    sendMessage.mockRejectedValue({ response: { error_code: 403 } });
    prisma.telegramGroup.update.mockResolvedValue({});
    await service.flushDigests();
    expect(prisma.telegramGroup.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { isActive: false },
    });
  });
});

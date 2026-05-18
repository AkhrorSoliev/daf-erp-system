import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TelegramGroupAnnouncementService } from './telegram-group-announcement.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { EntityHistoryService } from '../common/entity-history';

describe('TelegramGroupAnnouncementService', () => {
  let service: TelegramGroupAnnouncementService;

  const mockPrisma = {
    telegramGroup: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  };
  const sendMessage = jest.fn().mockResolvedValue(undefined);
  const mockAdminBot = {
    getBot: jest.fn().mockReturnValue({ telegram: { sendMessage } }),
  };
  const mockHistory = {
    recordCreate: jest.fn().mockResolvedValue(undefined),
  };

  const caller = { id: 1, companyId: 1001 };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.telegramGroup.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupAnnouncementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TelegramAdminBotService, useValue: mockAdminBot },
        { provide: EntityHistoryService, useValue: mockHistory },
      ],
    }).compile();
    service = module.get(TelegramGroupAnnouncementService);
  });

  it('refuses when neither templateKey nor customMessage given', async () => {
    await expect(service.broadcast({}, caller)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses when both templateKey and customMessage given', async () => {
    await expect(
      service.broadcast(
        { templateKey: 'GENERAL', customMessage: 'x' },
        caller,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('renders template variables', async () => {
    mockPrisma.telegramGroup.findMany.mockResolvedValue([
      { id: '1', chatId: BigInt(-1) },
    ]);
    await service.broadcast(
      {
        templateKey: 'GENERAL',
        variables: { title: 'Salom', body: 'Yangilik bor' },
      },
      caller,
    );
    expect(sendMessage).toHaveBeenCalledWith(
      '-1',
      expect.stringContaining('Salom'),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('marks missing variables visibly so author notices', async () => {
    mockPrisma.telegramGroup.findMany.mockResolvedValue([
      { id: '1', chatId: BigInt(-1) },
    ]);
    await service.broadcast({ templateKey: 'GENERAL' }, caller);
    expect(sendMessage).toHaveBeenCalledWith(
      '-1',
      expect.stringContaining('[?title?]'),
      expect.any(Object),
    );
  });

  it('dryRun returns preview without sending', async () => {
    mockPrisma.telegramGroup.findMany.mockResolvedValue([
      { id: '1', chatId: BigInt(-1) },
      { id: '2', chatId: BigInt(-2) },
    ]);
    const result = await service.broadcast(
      { templateKey: 'GENERAL', variables: { title: 'a', body: 'b' }, dryRun: true },
      caller,
    );
    expect(result.dryRun).toBe(true);
    expect(result.recipientCount).toBe(2);
    expect(result.sentCount).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('records audit log after sending', async () => {
    mockPrisma.telegramGroup.findMany.mockResolvedValue([
      { id: '1', chatId: BigInt(-1) },
    ]);
    await service.broadcast({ customMessage: 'Hi' }, caller);
    expect(mockHistory.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Announcement',
        changedById: 1,
        companyId: 1001,
      }),
    );
  });
});

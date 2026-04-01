import { Test, TestingModule } from '@nestjs/testing';
import { SmsService } from './sms.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { EntityHistoryService } from '../common/entity-history';

describe('SmsService', () => {
  let service: SmsService;
  let prisma: any;
  let telegramService: any;
  let entityHistoryService: any;
  let mockBot: any;

  beforeEach(async () => {
    mockBot = {
      telegram: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 12345 }),
      },
    };

    prisma = {
      student: {
        findUnique: jest.fn(),
      },
      smsMessage: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'sms-1',
          ...data,
          createdAt: new Date(),
        })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    telegramService = {
      getBot: jest.fn().mockReturnValue(mockBot),
    };

    entityHistoryService = {
      recordCreate: jest.fn().mockResolvedValue({}),
      recordUpdate: jest.fn().mockResolvedValue({}),
      recordDelete: jest.fn().mockResolvedValue({}),
      recordStatusChange: jest.fn().mockResolvedValue({}),
      recordRestore: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramService, useValue: telegramService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  describe('sendToStudent', () => {
    it('should send message and save with SENT status', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: '123456',
      });

      await service.sendToStudent(10001, 'Test message', 'MANUAL', 10002, 1);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456',
        'Test message',
        { parse_mode: 'HTML' },
      );
      expect(prisma.smsMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 10001,
          content: 'Test message',
          type: 'MANUAL',
          status: 'SENT',
          senderUserId: 10002,
          telegramMessageId: 12345,
          companyId: 1,
        }),
      });
    });

    it('should save FAILED status when student has no telegramChatId', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: null,
      });

      await service.sendToStudent(10001, 'Test message', 'AUTO');

      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
      expect(prisma.smsMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 10001,
          status: 'FAILED',
          errorMessage: "Telegram bog'lanmagan",
        }),
      });
    });

    it('should save FAILED status when student not found', async () => {
      prisma.student.findUnique.mockResolvedValue(null);

      await service.sendToStudent(10001, 'Test message', 'AUTO');

      expect(prisma.smsMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: "Telegram bog'lanmagan",
        }),
      });
    });

    it('should save FAILED status when bot is not available', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: '123456',
      });
      telegramService.getBot.mockReturnValue(null);

      await service.sendToStudent(10001, 'Test message', 'AUTO');

      expect(prisma.smsMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Telegram bot ishlamayapti',
        }),
      });
    });

    it('should save FAILED status when Telegram API throws', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: '123456',
      });
      mockBot.telegram.sendMessage.mockRejectedValue(
        new Error('Chat not found'),
      );

      await service.sendToStudent(10001, 'Test message', 'AUTO');

      expect(prisma.smsMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Chat not found',
        }),
      });
    });

    it('should set senderUserId to null for system messages', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: '123456',
      });

      await service.sendToStudent(10001, 'Auto message', 'AUTO');

      expect(prisma.smsMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'AUTO',
          senderUserId: null,
          companyId: null,
        }),
      });
    });

    it('should record entity history for AUTO messages', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: '123456',
      });

      await service.sendToStudent(10001, '<b>Test</b> message', 'AUTO', undefined, 1);

      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith({
        entityType: 'Student',
        entityId: 10001,
        newValues: expect.objectContaining({
          action: 'SMS_YUBORILDI',
          holat: 'Yuborildi',
        }),
        changedById: undefined,
        companyId: 1,
      });
    });

    it('should record entity history for MANUAL messages with sender', async () => {
      prisma.student.findUnique.mockResolvedValue({
        telegramChatId: '123456',
      });

      await service.sendToStudent(10001, 'Manual message', 'MANUAL', 10002, 1);

      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith({
        entityType: 'Student',
        entityId: 10001,
        newValues: expect.objectContaining({
          action: 'SMS_YUBORILDI',
          tur: "Qo'lda",
        }),
        changedById: 10002,
        companyId: 1,
      });
    });
  });

  describe('getByStudent', () => {
    it('should return paginated messages', async () => {
      const messages = [
        { id: 'sms-1', content: 'Hello', createdAt: new Date() },
        { id: 'sms-2', content: 'World', createdAt: new Date() },
      ];
      prisma.smsMessage.findMany.mockResolvedValue(messages);
      prisma.smsMessage.count.mockResolvedValue(25);

      const result = await service.getByStudent(10001, 2, 10);

      expect(result).toEqual({
        data: messages,
        total: 25,
        page: 2,
        pageSize: 10,
      });
      expect(prisma.smsMessage.findMany).toHaveBeenCalledWith({
        where: { studentId: 10001 },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
        include: {
          senderUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    it('should use default pagination values', async () => {
      prisma.smsMessage.findMany.mockResolvedValue([]);
      prisma.smsMessage.count.mockResolvedValue(0);

      const result = await service.getByStudent(10001);

      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
      expect(prisma.smsMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });
});

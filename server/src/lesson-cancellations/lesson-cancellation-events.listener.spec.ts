import { Test, TestingModule } from '@nestjs/testing';
import { LessonCancellationEventsListener } from './lesson-cancellation-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LessonCancellationEventsListener', () => {
  let listener: LessonCancellationEventsListener;
  let prisma: any;
  let smsService: any;
  let notificationsService: any;
  let gateway: any;
  let pushService: any;
  let telegramService: any;
  let entityHistoryService: any;
  let bot: any;

  const basePayload = {
    groupId: 'group-1',
    cancellationId: 'cn-1',
    date: '2026-05-21',
    reason: 'Bayram',
    cancelledById: 99,
    companyId: 1,
  };

  beforeEach(async () => {
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
    prisma = {
      group: { findFirst: jest.fn() },
      enrollment: { findMany: jest.fn() },
    };
    smsService = { sendToStudent: jest.fn().mockResolvedValue({}) };
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'n-1' }),
    };
    gateway = { sendToUser: jest.fn() };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    telegramService = { getBot: jest.fn().mockReturnValue(bot) };
    entityHistoryService = { recordCreate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonCancellationEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: smsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        { provide: TelegramService, useValue: telegramService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    listener = module.get(LessonCancellationEventsListener);
  });

  function setup(opts: {
    teachers: { id: number; telegramChatId: string | null }[];
    students: { id: number; telegramChatId: string | null }[];
  }) {
    prisma.group.findFirst.mockResolvedValue({
      id: 'group-1',
      name: 'A1',
      teachers: opts.teachers.map((t) => ({ teacher: t })),
    });
    prisma.enrollment.findMany.mockResolvedValue(
      opts.students.map((s) => ({ student: s })),
    );
  }

  it('sends a generic cancellation message to students (no admin reason exposed)', async () => {
    setup({
      teachers: [],
      students: [{ id: 10001, telegramChatId: 'chat-a' }],
    });

    await listener.handle(basePayload);

    expect(smsService.sendToStudent).toHaveBeenCalledTimes(1);
    const sentBody = smsService.sendToStudent.mock.calls[0][1];
    expect(sentBody).toContain('bekor qilindi');
    expect(sentBody).toContain('21.05.2026');
    // Reason text is NOT in the student message.
    expect(sentBody).not.toContain('Bayram');
  });

  it('teacher message DOES include the reason', async () => {
    setup({
      teachers: [{ id: 20001, telegramChatId: 'tchat' }],
      students: [],
    });

    await listener.handle(basePayload);

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      'tchat',
      expect.stringContaining('Bayram'),
      expect.any(Object),
    );
  });

  it('records group history with counts', async () => {
    setup({
      teachers: [{ id: 20001, telegramChatId: 'tchat' }],
      students: [
        { id: 10001, telegramChatId: 'chat-a' },
        { id: 10002, telegramChatId: null },
      ],
    });

    await listener.handle(basePayload);

    expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Group',
        entityId: 'group-1',
        newValues: expect.objectContaining({
          action: 'TELEGRAM_XABARNOMASI_YUBORILDI',
          voqea: 'lesson-cancellation.created',
          oquvchilarga_yuborildi: 1,
          telegramsiz_oquvchilar: 1,
          ustozlarga_yuborildi: 1,
        }),
      }),
    );
  });
});

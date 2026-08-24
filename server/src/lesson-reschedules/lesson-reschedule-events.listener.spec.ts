import { Test, TestingModule } from '@nestjs/testing';
import { LessonRescheduleEventsListener } from './lesson-reschedule-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LessonRescheduleEventsListener', () => {
  let listener: LessonRescheduleEventsListener;
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
    rescheduleId: 'rs-1',
    originalDate: '2026-05-16',
    newDate: '2026-05-19',
    newRoomId: null,
    newLessonStartTime: null,
    newLessonEndTime: null,
    reason: 'Bayram',
    scheduledById: 99,
    companyId: 1,
  };

  beforeEach(async () => {
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
    prisma = {
      group: { findFirst: jest.fn() },
      enrollment: { findMany: jest.fn() },
      room: { findFirst: jest.fn() },
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
        LessonRescheduleEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: smsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        { provide: TelegramService, useValue: telegramService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    listener = module.get(LessonRescheduleEventsListener);
  });

  function setupGroupAndStudents(opts: {
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

  it('sends Telegram via SmsService for every student with telegramChatId', async () => {
    setupGroupAndStudents({
      teachers: [],
      students: [
        { id: 10001, telegramChatId: 'chat-a' },
        { id: 10002, telegramChatId: 'chat-b' },
      ],
    });

    await listener.handleCreated(basePayload);

    expect(smsService.sendToStudent).toHaveBeenCalledTimes(2);
    expect(smsService.sendToStudent).toHaveBeenCalledWith(
      10001,
      expect.stringContaining("ko'chirildi"),
      'AUTO',
      99,
      1,
    );
  });

  it('silently skips students without telegramChatId (no SmsService call)', async () => {
    setupGroupAndStudents({
      teachers: [],
      students: [
        { id: 10001, telegramChatId: null },
        { id: 10002, telegramChatId: 'chat-b' },
      ],
    });

    await listener.handleCreated(basePayload);

    expect(smsService.sendToStudent).toHaveBeenCalledTimes(1);
    expect(smsService.sendToStudent).toHaveBeenCalledWith(
      10002,
      expect.any(String),
      'AUTO',
      99,
      1,
    );
  });

  it('delivers 4-channel to teachers (DB + SSE + Push + Telegram)', async () => {
    setupGroupAndStudents({
      teachers: [{ id: 20001, telegramChatId: 'tchat-a' }],
      students: [],
    });

    await listener.handleCreated(basePayload);

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 20001,
        type: 'LESSON_RESCHEDULED',
        relatedEntityType: 'Group',
        relatedEntityId: 'group-1',
      }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      20001,
      expect.objectContaining({ type: 'notification' }),
    );
    expect(pushService.sendToUser).toHaveBeenCalledWith(
      20001,
      expect.objectContaining({ url: '/groups/group-1' }),
    );
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      'tchat-a',
      expect.stringContaining("Dars ko'chirildi"),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('skips Telegram step when teacher has no telegramChatId (other 3 channels still fire)', async () => {
    setupGroupAndStudents({
      teachers: [{ id: 20001, telegramChatId: null }],
      students: [],
    });

    await listener.handleCreated(basePayload);

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(gateway.sendToUser).toHaveBeenCalledTimes(1);
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('records group history with notification counts', async () => {
    setupGroupAndStudents({
      teachers: [{ id: 20001, telegramChatId: 'tchat-a' }],
      students: [
        { id: 10001, telegramChatId: 'chat-a' },
        { id: 10002, telegramChatId: null },
        { id: 10003, telegramChatId: 'chat-b' },
      ],
    });

    await listener.handleCreated(basePayload);

    expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Group',
        entityId: 'group-1',
        newValues: expect.objectContaining({
          action: 'TELEGRAM_XABARNOMASI_YUBORILDI',
          oquvchilarga_yuborildi: 2,
          telegramsiz_oquvchilar: 1,
          ustozlarga_yuborildi: 1,
        }),
      }),
    );
  });

  it('swallows per-recipient Telegram errors and continues to next', async () => {
    setupGroupAndStudents({
      teachers: [],
      students: [
        { id: 10001, telegramChatId: 'chat-a' },
        { id: 10002, telegramChatId: 'chat-b' },
      ],
    });
    smsService.sendToStudent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});

    await listener.handleCreated(basePayload);

    // Both attempts ran (failure didn't abort the loop).
    expect(smsService.sendToStudent).toHaveBeenCalledTimes(2);
    // History records 1 success (the second one).
    expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          oquvchilarga_yuborildi: 1,
        }),
      }),
    );
  });

  it('handleUpdated dispatches the same flow with "yangilandi" wording', async () => {
    setupGroupAndStudents({
      teachers: [{ id: 20001, telegramChatId: 'tchat-a' }],
      students: [],
    });

    await listener.handleUpdated(basePayload);

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      'tchat-a',
      expect.stringContaining('yangilandi'),
      expect.any(Object),
    );
  });
});

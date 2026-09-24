import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationType,
  PaymentMethod,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { NotificationEventsListener } from './notification-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('NotificationEventsListener', () => {
  let listener: NotificationEventsListener;
  let prisma: any;
  let notificationsService: any;
  let gateway: any;
  let pushService: any;
  let telegramService: { getBot: jest.Mock };
  let enqueue: jest.Mock;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Admin', lastName: 'User' }),
        findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
        findFirst: jest.fn().mockResolvedValue({ id: 5 }),
      },
      student: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }),
      },
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    gateway = { sendToUser: jest.fn() };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    // getBot() → null keeps the one remaining instant sender (payment
    // promise) off the network unless a test opts in.
    telegramService = { getBot: jest.fn().mockReturnValue(null) };
    enqueue = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        { provide: TelegramService, useValue: telegramService },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();

    listener = module.get(NotificationEventsListener);
  });

  describe('handlePaymentCorrected', () => {
    const payload = {
      studentId: 10001,
      oldAmount: 5000000,
      newAmount: 400000,
      oldMethod: PaymentMethod.CASH,
      newMethod: PaymentMethod.CASH,
      reason: 'Ortiqcha nol kiritilgan',
      performedById: 99,
      companyId: 1,
    };

    it('notifies every company CEO across the instant channels', async () => {
      await listener.handlePaymentCorrected(payload);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: NotificationType.SYSTEM,
          relatedEntityType: 'Student',
          relatedEntityId: '10001',
          companyId: 1,
        }),
      );
    });

    it('includes the performer, old/new amounts and reason in the message', async () => {
      await listener.handlePaymentCorrected(payload);

      const { message } = notificationsService.create.mock.calls[0][0];
      expect(message).toContain('Admin User');
      expect(message).toContain('Ali Valiyev');
      expect(message).toContain('5 000 000');
      expect(message).toContain('400 000');
      expect(message).toContain('Ortiqcha nol kiritilgan');
    });

    it('includes the method change in the message when the method was corrected', async () => {
      await listener.handlePaymentCorrected({
        ...payload,
        oldAmount: 400000,
        newAmount: 400000,
        newMethod: PaymentMethod.TRANSFER,
      });

      const { message } = notificationsService.create.mock.calls[0][0];
      expect(message).toContain('Naqd');
      expect(message).toContain("Bank o'tkazmasi");
    });

    it('queues one structured Telegram row per CEO instead of sending', async () => {
      await listener.handlePaymentCorrected(payload);

      expect(enqueue).toHaveBeenCalledTimes(2);
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 1,
        companyId: 1,
        category: TelegramDigestCategory.PAYMENT_CORRECTED,
        payload: {
          performerName: 'Admin User',
          studentName: 'Ali Valiyev',
          studentId: 10001,
          oldAmount: 5000000,
          newAmount: 400000,
          oldMethod: PaymentMethod.CASH,
          newMethod: PaymentMethod.CASH,
          reason: 'Ortiqcha nol kiritilgan',
        },
      });
      expect(telegramService.getBot).not.toHaveBeenCalled();
    });

    it('does nothing when the company has no CEO', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await listener.handlePaymentCorrected(payload);
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('queries only active, non-archived CEO recipients', async () => {
      await listener.handlePaymentCorrected(payload);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toEqual(
        expect.objectContaining({
          deletedAt: null,
          isActive: true,
          companyId: 1,
          roles: { some: { role: { name: 'CEO' } } },
        }),
      );
    });

    it('swallows errors without throwing', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('db down'));
      await expect(
        listener.handlePaymentCorrected(payload),
      ).resolves.toBeUndefined();
    });
  });

  describe('task events', () => {
    const comment = {
      id: 'c1',
      content: 'Hisobotni tayyorlang',
      companyId: 1,
      entityType: 'Student',
      entityId: '10001',
      authorId: 7,
      author: { firstName: 'Ali', lastName: 'Karimov' },
    };

    beforeEach(() => {
      // filterActiveRecipientIds(): only 20001 is still an active user.
      prisma.user.findMany.mockResolvedValue([{ id: 20001 }]);
    });

    it.each([
      ['handleTaskAssigned', TelegramDigestCategory.TASK_ASSIGNED],
      ['handleTaskUpdated', TelegramDigestCategory.TASK_UPDATED],
      ['handleTaskDeleted', TelegramDigestCategory.TASK_DELETED],
    ] as const)(
      '%s keeps DB/SSE/push instant and queues the Telegram leg',
      async (handler, category) => {
        await listener[handler]({ comment, assigneeIds: [20001, 20002] });

        expect(notificationsService.create).toHaveBeenCalledTimes(1);
        expect(gateway.sendToUser).toHaveBeenCalledWith(
          20001,
          expect.any(Object),
        );
        expect(pushService.sendToUser).toHaveBeenCalledWith(
          20001,
          expect.objectContaining({ url: '/tasks' }),
        );
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue).toHaveBeenCalledWith({
          recipientKind: TelegramDigestRecipientKind.USER,
          recipientId: 20001,
          companyId: 1,
          category,
          relatedEntityId: 'c1',
          payload: {
            authorName: 'Ali Karimov',
            content: 'Hisobotni tayyorlang',
          },
        });
      },
    );

    it('clips long task text to 80 characters', async () => {
      await listener.handleTaskAssigned({
        comment: { ...comment, content: 'x'.repeat(100) },
        assigneeIds: [20001],
      });
      expect(enqueue.mock.calls[0][0].payload.content).toBe(
        `${'x'.repeat(80)}...`,
      );
    });

    it('queues a status change for the author, keyed per assignee', async () => {
      await listener.handleTaskStatusChanged({
        comment,
        assignee: {
          userId: 20002,
          user: { firstName: 'Vali', lastName: 'Aliyev' },
        },
        newStatus: 'DONE',
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7 }),
      );
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 7,
        companyId: 1,
        category: TelegramDigestCategory.TASK_STATUS_CHANGED,
        relatedEntityId: 'c1:20002',
        payload: {
          assigneeName: 'Vali Aliyev',
          status: 'DONE',
          content: 'Hisobotni tayyorlang',
        },
      });
    });
  });

  describe('handleSalaryCarriedOver', () => {
    const item = (teacherId: number, amount: number) => ({
      teacherId,
      studentId: 10001,
      groupId: 'g1',
      amount,
      lessonDate: new Date('2026-08-20T00:00:00.000Z'),
      creditPeriodDate: new Date('2026-09-01T00:00:00.000Z'),
      companyId: 1,
    });

    it('queues one summed row per active teacher', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 6 ? null : { id: where.id }),
      );

      await listener.handleSalaryCarriedOver({
        companyId: 1,
        items: [item(5, 20000), item(5, 30000), item(6, 10000)],
      });

      expect(enqueue).toHaveBeenCalledTimes(1); // teacher 6 is inactive
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 5,
        companyId: 1,
        category: TelegramDigestCategory.SALARY_CARRIED_OVER,
        payload: { count: 2, total: 50000 },
      });
    });
  });

  describe('handlePaymentPromiseOverdue', () => {
    it('still sends Telegram instantly and queues nothing', async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      telegramService.getBot.mockReturnValue({ telegram: { sendMessage } });
      prisma.user.findMany.mockResolvedValue([{ id: 3 }]);
      prisma.user.findUnique.mockResolvedValue({ telegramChatId: 'chat-3' });

      await listener.handlePaymentPromiseOverdue({
        promiseId: 'pp-1',
        studentId: 10001,
        companyId: 1,
        branchId: null,
        promiseDate: '2026-09-20T00:00:00.000Z',
      });

      expect(sendMessage).toHaveBeenCalledWith(
        'chat-3',
        expect.stringContaining("To'lov sanasi o'tib ketdi"),
        { parse_mode: 'HTML' },
      );
      expect(enqueue).not.toHaveBeenCalled();
    });
  });
});

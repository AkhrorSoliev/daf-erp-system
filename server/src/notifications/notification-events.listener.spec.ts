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
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ url: '/students/profile/10001' }),
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
    const promiseRow = (
      studentId: number,
      lastName: string,
      balance: number,
    ) => ({
      studentId,
      promiseDate: new Date('2026-10-09T18:59:59.999Z'),
      comment: "Qisman to'lov 250 000 so'm",
      balanceAtPromise: balance,
      createdBy: { firstName: 'Malika', lastName: 'Jamoliddinova' },
      student: {
        firstName: 'Xayrulloxon',
        lastName,
        balance,
        phone: '931234540',
        parentPhone: null,
        enrollments: [
          {
            status: 'ACTIVE',
            group: {
              name: '#006',
              teachers: [
                { teacher: { firstName: 'Gulnora', lastName: 'Karimova' } },
              ],
            },
          },
        ],
      },
    });

    beforeEach(() => {
      prisma.paymentPromise = {
        findMany: jest
          .fn()
          .mockResolvedValue([
            promiseRow(10001, 'Rahimxonov', -115_385),
            promiseRow(10002, 'Mayda', -238),
          ]),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ studentId: 10001, _count: { _all: 2 } }]),
      };
      prisma.branch = {
        findFirst: jest.fn().mockResolvedValue({ name: 'Namangan filiali' }),
      };
    });

    it('sends the branch one list instantly and queues nothing', async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      telegramService.getBot.mockReturnValue({ telegram: { sendMessage } });
      prisma.user.findMany.mockResolvedValue([{ id: 3 }]);
      prisma.user.findUnique.mockResolvedValue({ telegramChatId: 'chat-3' });

      await listener.handlePaymentPromiseOverdue({
        companyId: 1,
        branchId: 2,
        promiseIds: ['pp-1', 'pp-2'],
      });

      expect(sendMessage).toHaveBeenCalledTimes(1);
      const text = sendMessage.mock.calls[0][1] as string;
      expect(text).toContain("Bugun 1 ta to'lov va'dasi bajarilmadi");
      expect(text).toContain('Namangan filiali');
      expect(text).toContain(
        "1. <b>Rahimxonov Xayrulloxon</b> — qarz 115 385 so'm",
      );
      expect(text).toContain('#006, ustoz Karimova G. · 📞 +998 93 123 45 40');
      expect(text).toContain("Va'dadan beri to'lov yo'q · 2-marta buzildi");
      // A debt under 1 000 so'm paid down meanwhile is left out.
      expect(text).not.toContain('Mayda');
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Bugun 1 ta to'lov va'dasi bajarilmadi",
          message: "Rahimxonov Xayrulloxon — qo'ng'iroq qiling",
          relatedEntityType: 'BrokenPromises',
          relatedEntityId: '2',
        }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ url: '/payments/debt?promise=broken' }),
      );
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('sends nothing when every row dropped below the threshold', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        promiseRow(10002, 'Mayda', -238),
      ]);
      await listener.handlePaymentPromiseOverdue({
        companyId: 1,
        branchId: 2,
        promiseIds: ['pp-2'],
      });
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});

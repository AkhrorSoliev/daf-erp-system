import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationEventsListener } from './notification-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { TelegramService } from '../telegram/telegram.service';

describe('NotificationEventsListener — handlePaymentCorrected', () => {
  let listener: NotificationEventsListener;
  let prisma: any;
  let notificationsService: any;
  let gateway: any;
  let pushService: any;

  const payload = {
    studentId: 10001,
    oldAmount: 5000000,
    newAmount: 400000,
    oldMethod: 'CASH' as any,
    newMethod: 'CASH' as any,
    reason: 'Ortiqcha nol kiritilgan',
    performedById: 99,
    companyId: 1,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Admin', lastName: 'User' }),
        findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        // sendTelegram early-returns when getBot() is falsy — keeps the
        // test off the real Telegram API.
        { provide: TelegramService, useValue: { getBot: () => null } },
      ],
    }).compile();

    listener = module.get(NotificationEventsListener);
  });

  it('notifies every company CEO across all four channels', async () => {
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
      oldMethod: 'CASH' as any,
      newMethod: 'TRANSFER' as any,
    });

    const { message } = notificationsService.create.mock.calls[0][0];
    expect(message).toContain('Naqd');
    expect(message).toContain("Bank o'tkazmasi");
  });

  it('does nothing when the company has no CEO', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await listener.handlePaymentCorrected(payload);

    expect(notificationsService.create).not.toHaveBeenCalled();
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

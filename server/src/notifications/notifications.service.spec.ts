import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { encodeCursor } from '../tasks/task-cursor';

const mockNotification = {
  id: 'notif-uuid-1',
  userId: 10001,
  type: NotificationType.TASK_ASSIGNED,
  title: 'Yangi topshiriq',
  message: 'CEO sizga topshiriq berdi',
  relatedEntityType: 'Student',
  relatedEntityId: '10001',
  commentId: 'comment-uuid-1',
  isRead: false,
  companyId: 1001,
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn().mockResolvedValue(mockNotification),
        findMany: jest.fn().mockResolvedValue([mockNotification]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pushSubscription: {
        upsert: jest.fn().mockResolvedValue({ id: 'push-uuid-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deviceToken: {
        upsert: jest.fn().mockResolvedValue({ id: 'device-uuid-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('create', () => {
    it('should create a notification', async () => {
      const result = await service.create({
        userId: 10001,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Yangi topshiriq',
        message: 'Test message',
        relatedEntityType: 'Student',
        relatedEntityId: '10001',
        commentId: 'comment-uuid-1',
        companyId: 1001,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 10001,
          type: NotificationType.TASK_ASSIGNED,
          title: 'Yangi topshiriq',
          companyId: 1001,
        }),
      });
      expect(result).toEqual({ ...mockNotification, group: 'task' });
    });

    it('stamps whether it waits and the lesson-day key', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-10T04:30:00.000Z'));
      prisma.notification.create.mockResolvedValue({
        ...mockNotification,
        type: NotificationType.ATTENDANCE_ADMIN_ALERT,
      });
      const result = await service.create({
        userId: 10001,
        type: NotificationType.ATTENDANCE_ADMIN_ALERT,
        title: "O'qituvchi hali davomat olmadi",
        message: 'm',
        relatedEntityType: 'Group',
        relatedEntityId: 'g1',
        companyId: 1001,
      });
      jest.useRealTimers();

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionRequired: true,
          groupKey: 'ATTENDANCE_ADMIN_ALERT:2026-10-10',
        }),
      });
      expect(result.group).toBe('attendance');
    });

    it("keeps the caller's actionRequired over the type's default", async () => {
      await service.create({
        userId: 10001,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Kuzatuvchi qilindingiz',
        message: 'm',
        companyId: 1001,
        actionRequired: false,
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionRequired: false,
          groupKey: null,
        }),
      });
    });

    it('stores the task a notification belongs to', async () => {
      await service.create({
        userId: 10001,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Yangi topshiriq',
        message: 'Test message',
        relatedEntityType: 'Task',
        relatedEntityId: 'task-uuid-1',
        taskId: 'task-uuid-1',
        companyId: 1001,
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ taskId: 'task-uuid-1' }),
      });
    });
  });

  describe('findByUser', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...mockNotification,
        id: `id-${i}`,
        createdAt: new Date(Date.UTC(2026, 9, 10, 10, 0, 0) - i * 60_000),
      }));

    it('pages newest first with a keyset cursor and serves each row with its group', async () => {
      const three = rows(3);
      prisma.notification.findMany.mockResolvedValue(three);

      const res = await service.findByUser(10001, { pageSize: 2 });

      const arg = prisma.notification.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ AND: [{ userId: 10001 }] });
      expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(arg.take).toBe(3);
      expect(res.data.map((r) => r.id)).toEqual(['id-0', 'id-1']);
      expect(res.data[0].group).toBe('task');
      expect(res.nextCursor).toBe(encodeCursor(three[1]));
    });

    it('filters what waits, by group and by text, and continues after a cursor', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      const at = new Date('2026-10-10T05:00:00.000Z');

      const res = await service.findByUser(10001, {
        filter: 'pending',
        type: 'payment',
        q: '  Sardor ',
        cursor: encodeCursor({ createdAt: at, id: 'id-9' }),
      });

      expect(prisma.notification.findMany.mock.calls[0][0].where.AND).toEqual([
        { userId: 10001 },
        { actionRequired: true, resolvedAt: null },
        { type: { in: ['PAYMENT_PROMISE_OVERDUE'] } },
        {
          OR: [
            { title: { contains: 'Sardor', mode: 'insensitive' } },
            { message: { contains: 'Sardor', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { createdAt: { lt: at } },
            { createdAt: at, id: { lt: 'id-9' } },
          ],
        },
      ]);
      expect(res).toEqual({ data: [], nextCursor: null });
    });

    it('refuses a cursor it did not issue', async () => {
      await expect(
        service.findByUser(10001, { cursor: 'bm90LWEtY3Vyc29y' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUnreadCount', () => {
    it('counts only what waits for the user and is unread (the badge)', async () => {
      prisma.notification.count.mockResolvedValue(5);
      expect(await service.getUnreadCount(10001)).toEqual({ count: 5 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 10001,
          actionRequired: true,
          resolvedAt: null,
          isRead: false,
        },
      });
    });
  });

  describe('getCounts', () => {
    it("adds the user's rows up by group, beside what waits", async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'TASK_REVIEW', _count: { _all: 4 } },
        { type: 'ATTENDANCE_ADMIN_ALERT', _count: { _all: 10 } },
        { type: 'LESSON_STARTED', _count: { _all: 2 } },
        { type: 'SYSTEM', _count: { _all: 1 } },
      ]);
      prisma.notification.count.mockResolvedValue(5);

      expect(await service.getCounts(10001)).toEqual({
        pending: 5,
        all: 17,
        groups: { task: 4, attendance: 12, payment: 0, system: 1 },
      });
      expect(prisma.notification.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: { userId: 10001 },
        _count: { _all: true },
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 10001, actionRequired: true, resolvedAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('should mark a notification as read', async () => {
      const result = await service.markRead('notif-uuid-1', 10001);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-uuid-1', userId: 10001 },
        data: { isRead: true },
      });
      expect(result.message).toBeDefined();
    });
  });

  describe('markAllRead', () => {
    it('should mark all notifications as read', async () => {
      const result = await service.markAllRead(10001);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 10001, isRead: false },
        data: { isRead: true },
      });
      expect(result.message).toBeDefined();
    });
  });

  describe('registerPush', () => {
    it('should upsert push subscription', async () => {
      const result = await service.registerPush(
        10001,
        'https://push.example.com/123',
        'p256dh-key',
        'auth-key',
      );

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/123' },
        update: { userId: 10001, p256dh: 'p256dh-key', auth: 'auth-key' },
        create: {
          userId: 10001,
          endpoint: 'https://push.example.com/123',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      });
      expect(result).toBeDefined();
    });
  });

  describe('unregisterPush', () => {
    it('should delete push subscription', async () => {
      const result = await service.unregisterPush(
        10001,
        'https://push.example.com/123',
      );

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: 10001, endpoint: 'https://push.example.com/123' },
      });
      // Foydalanuvchi ekranda shu matnni o'qiydi — inglizcha so'zsiz.
      expect(result.message).toBe('Bildirishnoma obunasi olib tashlandi');
    });
  });

  describe('registerDevice', () => {
    it('upserts the device token keyed by token', async () => {
      await service.registerDevice(
        10001,
        'ExponentPushToken[abc]',
        'android',
        '1.0.0',
      );
      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: 'ExponentPushToken[abc]' },
          create: expect.objectContaining({
            userId: 10001,
            token: 'ExponentPushToken[abc]',
          }),
        }),
      );
    });
  });

  describe('unregisterDevice', () => {
    it('deletes the device token for the user', async () => {
      const result = await service.unregisterDevice(
        10001,
        'ExponentPushToken[abc]',
      );
      expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 10001, token: 'ExponentPushToken[abc]' },
      });
      expect(result.message).toBeDefined();
    });
  });
});

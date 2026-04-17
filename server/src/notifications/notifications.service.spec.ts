import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pushSubscription: {
        upsert: jest.fn().mockResolvedValue({ id: 'push-uuid-1' }),
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
      expect(result).toEqual(mockNotification);
    });
  });

  describe('findByUser', () => {
    it('should return paginated notifications', async () => {
      const result = await service.findByUser(10001, { page: 1, pageSize: 20 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 10001 },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: [mockNotification],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should handle page 2', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(25);

      const result = await service.findByUser(10001, { page: 2, pageSize: 20 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.page).toBe(2);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(10001);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 10001, isRead: false },
      });
      expect(result).toEqual({ count: 5 });
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
      expect(result.message).toBeDefined();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { AttendanceReminderService } from './attendance-reminder.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';

const makeGroup = (overrides: any = {}) => ({
  id: 'group-1',
  name: 'Deutsch A1',
  branchId: 1,
  companyId: 100,
  lessonStartTime: '09:00',
  lessonEndTime: '10:30',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31'),
  exactDays: ['monday', 'wednesday'],
  room: { name: '201-xona' },
  teachers: [
    {
      teacher: {
        id: 20001,
        firstName: 'Ali',
        lastName: 'Valiev',
        telegramChatId: '555111222',
      },
    },
  ],
  ...overrides,
});

describe('AttendanceReminderService', () => {
  let service: AttendanceReminderService;
  let prisma: any;
  let notificationsService: any;
  let gateway: any;
  let pushService: any;
  let telegramService: any;
  let bot: { telegram: { sendMessage: jest.Mock } };

  beforeEach(async () => {
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };

    prisma = {
      group: { findMany: jest.fn().mockResolvedValue([]) },
      holiday: { findFirst: jest.fn().mockResolvedValue(null) },
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };

    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'n-1' }),
    };
    gateway = { sendToUser: jest.fn() };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    telegramService = { getBot: jest.fn().mockReturnValue(bot) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();

    service = module.get(AttendanceReminderService);
  });

  describe('handleGroup', () => {
    it('sends LESSON_STARTED to teachers at lessonStartTime', async () => {
      const group = makeGroup();
      // lessonStartTime = "09:00" → 540 minutes
      await (service as any).handleGroup(group, 540, '2026-04-22');

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 20001,
          type: NotificationType.LESSON_STARTED,
          relatedEntityType: 'Group',
          relatedEntityId: 'group-1',
        }),
      );
      expect(gateway.sendToUser).toHaveBeenCalledWith(
        20001,
        expect.any(Object),
      );
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        20001,
        expect.objectContaining({ url: '/groups/group-1' }),
      );
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '555111222',
        expect.stringContaining('Darsingiz boshlandi'),
        expect.objectContaining({ parse_mode: 'HTML' }),
      );
      const [, telegramBody] = bot.telegram.sendMessage.mock.calls[0];
      expect(telegramBody).toContain('Guruh: Deutsch A1');
      expect(telegramBody).toContain('Vaqt: 09:00–10:30');
      expect(telegramBody).toContain('Xona: 201-xona');
      expect(telegramBody).toContain("O'qituvchi: Ali Valiev");
      // No attendance check when firing lesson-started
      expect(prisma.attendance.findFirst).not.toHaveBeenCalled();
    });

    it('skips LESSON_STARTED when already sent today (idempotency)', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'existing' });
      const group = makeGroup();

      await (service as any).handleGroup(group, 540, '2026-04-22');

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('notifies ONLY admins at lessonEndTime - 30 when attendance is missing', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 30001,
          firstName: 'Umid',
          lastName: 'Adminov',
          telegramChatId: '111222333',
        },
      ]);
      const group = makeGroup();
      // lessonEndTime = "10:30" → 630 minutes, -30 → 600
      await (service as any).handleGroup(group, 600, '2026-04-22');

      expect(prisma.attendance.findFirst).toHaveBeenCalled();
      // Admin notified
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 30001,
          type: NotificationType.ATTENDANCE_ADMIN_ALERT,
        }),
      );
      // Teacher NOT notified at -30
      expect(notificationsService.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: 20001 }),
      );
    });

    it('notifies ONLY teacher at lessonEndTime - 15 when attendance is missing', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 30001, firstName: 'U', lastName: 'A', telegramChatId: null },
      ]);
      const group = makeGroup();
      // lessonEndTime 630 - 15 = 615
      await (service as any).handleGroup(group, 615, '2026-04-22');

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 20001,
          type: NotificationType.ATTENDANCE_TEACHER_WARNING,
        }),
      );
      // Admins not notified in -15 trigger
      expect(notificationsService.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: 30001 }),
      );
    });

    it('notifies teacher + admins at lessonEndTime when attendance missing', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 30001, firstName: 'U', lastName: 'A', telegramChatId: null },
      ]);
      const group = makeGroup();
      // lessonEndTime → 630
      await (service as any).handleGroup(group, 630, '2026-04-22');

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 20001,
          type: NotificationType.ATTENDANCE_MISSING_TEACHER,
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 30001,
          type: NotificationType.ATTENDANCE_MISSING_ADMIN,
        }),
      );
    });

    it('short-circuits when attendance is already taken', async () => {
      prisma.attendance.findFirst.mockResolvedValue({ id: 'att-1' });
      const group = makeGroup();

      // Try all three attendance-gated trigger minutes
      for (const minute of [600, 615, 630]) {
        await (service as any).handleGroup(group, minute, '2026-04-22');
      }

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does nothing at non-trigger minutes', async () => {
      const group = makeGroup();
      await (service as any).handleGroup(group, 545, '2026-04-22');

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(prisma.attendance.findFirst).not.toHaveBeenCalled();
    });

    it('skips telegram when user has no telegramChatId', async () => {
      const group = makeGroup({
        teachers: [
          {
            teacher: {
              id: 20001,
              firstName: 'Ali',
              lastName: 'Valiev',
              telegramChatId: null,
            },
          },
        ],
      });

      await (service as any).handleGroup(group, 540, '2026-04-22');

      expect(notificationsService.create).toHaveBeenCalled();
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('sends to multiple teachers when group has more than one', async () => {
      const group = makeGroup({
        teachers: [
          {
            teacher: {
              id: 20001,
              firstName: 'A',
              lastName: 'B',
              telegramChatId: null,
            },
          },
          {
            teacher: {
              id: 20002,
              firstName: 'C',
              lastName: 'D',
              telegramChatId: null,
            },
          },
        ],
      });

      await (service as any).handleGroup(group, 540, '2026-04-22');

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 20001 }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 20002 }),
      );
    });
  });

  describe('groupHasLessonToday', () => {
    it('returns false when today is not in exactDays', () => {
      const result = (service as any).groupHasLessonToday(
        { startDate: null, endDate: null, exactDays: ['monday'] },
        new Date('2026-04-22'),
        3, // Wednesday
      );
      expect(result).toBe(false);
    });

    it('returns true when weekday matches', () => {
      const result = (service as any).groupHasLessonToday(
        { startDate: null, endDate: null, exactDays: ['wednesday'] },
        new Date('2026-04-22'),
        3,
      );
      expect(result).toBe(true);
    });

    it('returns false when outside date range', () => {
      const result = (service as any).groupHasLessonToday(
        {
          startDate: new Date('2026-05-01'),
          endDate: null,
          exactDays: ['wednesday'],
        },
        new Date('2026-04-22'),
        3,
      );
      expect(result).toBe(false);
    });
  });
});

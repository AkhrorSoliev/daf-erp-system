import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, UserStatus } from '@prisma/client';
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
      group: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
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

    const holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };

    const unmarked = { openForEndedLessons: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        { provide: TelegramService, useValue: telegramService },
        {
          provide: require('../holidays/holidays.service').HolidaysService,
          useValue: holidaysService,
        },
        {
          provide: require('./unmarked-lessons.service').UnmarkedLessonsService,
          useValue: unmarked,
        },
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

    it('notifies teacher AND admins at lessonEndTime - 30 when attendance is missing', async () => {
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
      // Teacher notified at -30
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 20001,
          type: NotificationType.ATTENDANCE_TEACHER_WARNING,
        }),
      );
      // Admin notified at -30
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 30001,
          type: NotificationType.ATTENDANCE_ADMIN_ALERT,
        }),
      );
      // The administrator is asked to warn the teacher (CEO-approved text).
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 30001,
          title: "O'qituvchi hali davomat olmadi",
          message:
            "👀 Dars tugashiga 30 daqiqa qoldi, o'qituvchi hali davomat olmadi\n\n" +
            '👥 Guruh: Deutsch A1\n' +
            '🕐 Vaqt: 09:00–10:30\n' +
            '🚪 Xona: 201-xona\n' +
            "👨‍🏫 O'qituvchi: Ali Valiev\n\n" +
            "Dars tugaguncha davomat olinmasa, ustozga bu dars uchun haq yozilmaydi. Iltimos, o'qituvchini ogohlantiring.\n" +
            '🔗 https://admin.dafzentrum.uz',
        }),
      );
    });

    it('leaves the lesson end to the sweep', async () => {
      const group = makeGroup();
      await (service as any).handleGroup(group, 10 * 60 + 30, '2026-09-30');
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('short-circuits when attendance is already taken', async () => {
      prisma.attendance.findFirst.mockResolvedValue({ id: 'att-1' });
      const group = makeGroup();

      // Try the attendance-gated trigger minute (end-30)
      await (service as any).handleGroup(group, 600, '2026-04-22');

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

  describe('sweep', () => {
    it('tells the teachers and administrators of every lesson it opened', async () => {
      const unmarked = {
        openForEndedLessons: jest.fn().mockResolvedValue([
          {
            groupId: 'group-1',
            groupName: 'Deutsch A1',
            companyId: 100,
            branchId: 1,
            startTime: '09:00',
            endTime: '10:30',
            date: '2026-09-30',
          },
        ]),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AttendanceReminderService,
          { provide: PrismaService, useValue: prisma },
          { provide: NotificationsService, useValue: notificationsService },
          { provide: NotificationsGateway, useValue: gateway },
          { provide: PushService, useValue: pushService },
          { provide: TelegramService, useValue: telegramService },
          {
            provide: require('../holidays/holidays.service').HolidaysService,
            useValue: {
              findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
            },
          },
          {
            provide: require('./unmarked-lessons.service')
              .UnmarkedLessonsService,
            useValue: unmarked,
          },
        ],
      }).compile();
      const svc = module.get(AttendanceReminderService);

      prisma.group.findUnique.mockResolvedValue(makeGroup());
      prisma.user.findMany.mockResolvedValue([
        {
          id: 30001,
          firstName: 'Admin',
          lastName: 'One',
          telegramChatId: null,
        },
      ]);

      await svc.closeDay();

      const types = notificationsService.create.mock.calls.map(
        (c: any[]) => c[0].type,
      );
      expect(types).toEqual([
        NotificationType.ATTENDANCE_MISSING_TEACHER,
        NotificationType.ATTENDANCE_MISSING_ADMIN,
      ]);
      const teacherText = notificationsService.create.mock.calls[0][0]
        .message as string;
      expect(teacherText).toContain('Bu dars uchun haq yozilmaydi');
      const adminText = notificationsService.create.mock.calls[1][0]
        .message as string;
      expect(adminText).toContain("Tizimda topshiriq ochildi: dars bo'ldimi?");
      expect(adminText).toContain('https://admin.dafzentrum.uz/tasks');
    });

    it('warns the teacher about pay half an hour before the end', async () => {
      const group = makeGroup();
      await (service as any).handleGroup(group, 10 * 60, '2026-09-30');
      const warning = notificationsService.create.mock.calls.find(
        (c: any[]) => c[0].type === NotificationType.ATTENDANCE_TEACHER_WARNING,
      );
      expect(warning[0].message).toContain(
        'Davomat dars tugaguncha olinmasa, bu dars uchun haq yozilmaydi',
      );
    });

    it('holiday only in branch 1 does not silence branch 2 reminder', async () => {
      jest.useFakeTimers();
      // Set time to 09:00 Wednesday 2026-04-22 in Tashkent
      jest.setSystemTime(new Date('2026-04-22T04:00:00.000Z'));

      const holidaysService = {
        findActiveHolidayCovering: jest
          .fn()
          .mockImplementation(async (date, branchId) => {
            return branchId === 1 ? { id: 'holiday-1' } : null;
          }),
      };
      const localPrisma = {
        group: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
        },
        holiday: { findFirst: jest.fn().mockResolvedValue(null) },
        attendance: { findFirst: jest.fn().mockResolvedValue(null) },
        notification: { findFirst: jest.fn().mockResolvedValue(null) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AttendanceReminderService,
          { provide: PrismaService, useValue: localPrisma },
          { provide: NotificationsService, useValue: notificationsService },
          { provide: NotificationsGateway, useValue: gateway },
          { provide: PushService, useValue: pushService },
          { provide: TelegramService, useValue: telegramService },
          {
            provide: require('../holidays/holidays.service').HolidaysService,
            useValue: holidaysService,
          },
          {
            provide: require('./unmarked-lessons.service')
              .UnmarkedLessonsService,
            useValue: { openForEndedLessons: jest.fn().mockResolvedValue([]) },
          },
        ],
      }).compile();
      const svc = module.get(AttendanceReminderService);

      try {
        const group1 = makeGroup({ id: 'group-1', branchId: 1 });
        const group2 = makeGroup({ id: 'group-2', branchId: 2 });
        localPrisma.group.findMany.mockResolvedValue([group1, group2]);
        localPrisma.attendance.findFirst.mockResolvedValue(null);
        (svc as any).scheduleWindow = { startMin: 0, endMin: 1440 };
        (svc as any).windowCachedAt = Date.now();

        await svc.tick();

        // branch 2 should get LESSON_STARTED despite branch 1 having holiday
        expect(notificationsService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 20001,
            type: NotificationType.LESSON_STARTED,
            relatedEntityId: 'group-2',
          }),
        );
        // holiday lookup called with both branches
        expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
          expect.any(Date),
          1,
        );
        expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
          expect.any(Date),
          2,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('sweep runs even when schedule window is closed', async () => {
      jest.useFakeTimers();
      // Set time to 00:30 to be outside any lesson window
      jest.setSystemTime(new Date('2026-04-22T19:30:00.000Z'));

      const unmarked = {
        openForEndedLessons: jest.fn().mockResolvedValue([]),
      };
      const localPrisma = {
        group: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
        },
        holiday: { findFirst: jest.fn().mockResolvedValue(null) },
        attendance: { findFirst: jest.fn().mockResolvedValue(null) },
        notification: { findFirst: jest.fn().mockResolvedValue(null) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AttendanceReminderService,
          { provide: PrismaService, useValue: localPrisma },
          { provide: NotificationsService, useValue: notificationsService },
          { provide: NotificationsGateway, useValue: gateway },
          { provide: PushService, useValue: pushService },
          { provide: TelegramService, useValue: telegramService },
          {
            provide: require('../holidays/holidays.service').HolidaysService,
            useValue: {
              findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
            },
          },
          {
            provide: require('./unmarked-lessons.service')
              .UnmarkedLessonsService,
            useValue: unmarked,
          },
        ],
      }).compile();
      const svc = module.get(AttendanceReminderService);

      try {
        // Close the window: end < start
        (svc as any).scheduleWindow = { startMin: 1440, endMin: 0 };
        (svc as any).windowCachedAt = Date.now();

        await svc.tick();

        // sweep should still run even though the window is closed
        expect(unmarked.openForEndedLessons).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('recipient filters (status sync)', () => {
    it('tick() queries group.findMany with teacher status=ACTIVE filter', async () => {
      // Force the schedule window cache so the tick proceeds to findMany
      (service as any).scheduleWindow = { startMin: 0, endMin: 1440 };
      (service as any).windowCachedAt = Date.now();

      await service.tick();

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            teachers: expect.objectContaining({
              where: {
                teacher: {
                  deletedAt: null,
                  isActive: true,
                  status: UserStatus.ACTIVE,
                },
              },
            }),
          }),
        }),
      );
    });

    it('notifyBranchAdmins filters admins by status=ACTIVE + isActive + deletedAt', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const group = makeGroup();

      await (service as any).notifyBranchAdmins(group, 'ADMIN_ALERT');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
            companyId: group.companyId,
          }),
        }),
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

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, UserStatus } from '@prisma/client';
import { AttendanceEventsListener } from './attendance-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';

describe('AttendanceEventsListener', () => {
  let listener: AttendanceEventsListener;
  let prisma: any;
  let notificationsService: any;
  let gateway: any;
  let pushService: any;
  let bot: { telegram: { sendMessage: jest.Mock } };

  beforeEach(async () => {
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'n-1' }),
    };
    gateway = { sendToUser: jest.fn() };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        {
          provide: TelegramService,
          useValue: { getBot: jest.fn().mockReturnValue(bot) },
        },
      ],
    }).compile();

    listener = module.get(AttendanceEventsListener);
  });

  const payload = {
    groupId: 'g-1',
    groupName: 'Deutsch A1',
    date: '2026-04-22',
    teacherIds: [20001, 20002],
    companyId: 100,
    stats: { present: 5, absent: 1, late: 2, excused: 0 },
  };

  it('sends stats notification to each teacher across channels', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 20001, telegramChatId: '111' },
      { id: 20002, telegramChatId: null },
    ]);

    await listener.handleAttendanceCompleted(payload);

    expect(notificationsService.create).toHaveBeenCalledTimes(2);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 20001,
        type: NotificationType.ATTENDANCE_COMPLETED,
        relatedEntityType: 'Group',
        relatedEntityId: 'g-1',
      }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      20001,
      expect.any(Object),
    );
    expect(pushService.sendToUser).toHaveBeenCalledWith(
      20001,
      expect.objectContaining({ url: '/groups/g-1' }),
    );
    // Only teacher 20001 has a chat id
    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '111',
      expect.stringContaining('Keldi: 5'),
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('skips a teacher when ATTENDANCE_COMPLETED already sent today', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 20001, telegramChatId: null }]);
    prisma.notification.findFirst.mockResolvedValue({ id: 'already' });

    await listener.handleAttendanceCompleted({ ...payload, teacherIds: [20001] });

    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });

  it('does nothing when teacherIds is empty', async () => {
    await listener.handleAttendanceCompleted({ ...payload, teacherIds: [] });

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('builds the stats message with all four status counters', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 20001, telegramChatId: '111' },
    ]);

    await listener.handleAttendanceCompleted({
      ...payload,
      teacherIds: [20001],
      stats: { present: 10, absent: 3, late: 1, excused: 2 },
    });

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(
          /Keldi: 10.*Kelmadi: 3.*Kechikdi: 1.*Sababli: 2/,
        ),
      }),
    );
  });

  it('filters teachers by status=ACTIVE, isActive=true, deletedAt=null', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await listener.handleAttendanceCompleted(payload);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [20001, 20002] },
          deletedAt: null,
          isActive: true,
          status: UserStatus.ACTIVE,
        }),
      }),
    );
  });

  it('skips teachers who are filtered out by status (no notification sent)', async () => {
    // Simulating that the DB filter removed a deactivated teacher: only one
    // of the two requested IDs comes back. The listener must not try to
    // notify the missing teacher.
    prisma.user.findMany.mockResolvedValue([
      { id: 20001, telegramChatId: '111' },
    ]);

    await listener.handleAttendanceCompleted(payload);

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 20001 }),
    );
    expect(notificationsService.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 20002 }),
    );
  });
});

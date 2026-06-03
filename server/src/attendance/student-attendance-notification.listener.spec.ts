import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus } from '@prisma/client';
import {
  AttendanceStudentRecordedPayload,
  StudentAttendanceNotificationListener,
} from './student-attendance-notification.listener';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

describe('StudentAttendanceNotificationListener', () => {
  let listener: StudentAttendanceNotificationListener;
  let prisma: any;
  let bot: { telegram: { sendMessage: jest.Mock } };
  let getBot: jest.Mock;

  const basePayload = (
    overrides: Partial<AttendanceStudentRecordedPayload> = {},
  ): AttendanceStudentRecordedPayload => ({
    studentId: 10042,
    groupId: 'g-1',
    groupName: 'Deutsch A1',
    date: '2026-04-30',
    oldStatus: null,
    newStatus: AttendanceStatus.PRESENT,
    companyId: 100,
    ...overrides,
  });

  beforeEach(async () => {
    // The listener is gated behind this flag (temporarily disabled in prod).
    // Enable it for the behavioural tests below; the default-off path has its
    // own dedicated test.
    process.env.STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED = 'true';
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };
    getBot = jest.fn().mockReturnValue(bot);
    prisma = {
      student: {
        findUnique: jest.fn().mockResolvedValue({
          firstName: 'Ahmad',
          lastName: 'Karimov',
          telegramChatId: '5550001',
        }),
      },
      group: {
        findUnique: jest.fn().mockResolvedValue({
          lessonStartTime: '18:30',
          lessonEndTime: '20:00',
          room: { name: '201-xona' },
          course: { lessonPaymentCount: 12 },
          teachers: [
            {
              teacher: { firstName: 'Aziz', lastName: 'Toshmatov' },
            },
          ],
        }),
      },
      attendance: {
        count: jest.fn().mockResolvedValue(5),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentAttendanceNotificationListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramService, useValue: { getBot } },
      ],
    }).compile();

    listener = module.get(StudentAttendanceNotificationListener);
  });

  afterEach(() => {
    delete process.env.STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED;
  });

  it('does NOT send anything when the feature flag is disabled (default)', async () => {
    delete process.env.STUDENT_ATTENDANCE_NOTIFICATIONS_ENABLED;

    await listener.handle(basePayload());

    expect(getBot).not.toHaveBeenCalled();
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a rich PRESENT message with name, group, teacher, room, lesson, time, portal', async () => {
    await listener.handle(basePayload());

    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, opts] = bot.telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('5550001');
    expect(text).toContain('Hurmatli Ahmad Karimov!');
    expect(text).toContain('✅');
    expect(text).toContain('keldingiz');
    expect(text).toContain('Deutsch A1');
    expect(text).toContain('Aziz Toshmatov');
    expect(text).toContain('201-xona');
    expect(text).toContain('5 / 12');
    expect(text).toContain('30.04.2026');
    expect(text).toContain('18:30');
    expect(text).toContain('20:00');
    expect(text).toContain('https://student.dafzentrum.uz');
    expect(opts).toEqual({
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  it('sends a LATE message with the kech keldingiz wording', async () => {
    await listener.handle(
      basePayload({ newStatus: AttendanceStatus.LATE, oldStatus: null }),
    );

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('⏰');
    expect(text).toContain('kech keldingiz');
    expect(text).toContain('Aziz Toshmatov');
    expect(text).toContain('5 / 12');
    expect(text).toContain('https://student.dafzentrum.uz');
  });

  it('sends an ABSENT message with kelmadingiz wording and contact-teacher hint', async () => {
    await listener.handle(
      basePayload({ newStatus: AttendanceStatus.ABSENT, oldStatus: null }),
    );

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('❌');
    expect(text).toContain('ishtirok etmadingiz');
    expect(text).toContain("o'qituvchingiz bilan bog'laning");
    expect(text).toContain('https://student.dafzentrum.uz');
  });

  it('does NOT send a Telegram message for EXCUSED', async () => {
    await listener.handle(
      basePayload({ newStatus: AttendanceStatus.EXCUSED, oldStatus: null }),
    );

    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skips silently when the student has no telegramChatId', async () => {
    prisma.student.findUnique.mockResolvedValue({
      firstName: 'Ahmad',
      lastName: 'Karimov',
      telegramChatId: null,
    });

    await listener.handle(basePayload());

    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skips silently when the student row is missing entirely', async () => {
    prisma.student.findUnique.mockResolvedValue(null);

    await listener.handle(basePayload());

    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skips silently when the bot is not initialised', async () => {
    getBot.mockReturnValue(null);

    await listener.handle(basePayload());

    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('omits the lesson time block when group has no lessonStartTime', async () => {
    prisma.group.findUnique.mockResolvedValue({
      lessonStartTime: null,
      lessonEndTime: null,
      room: { name: '201-xona' },
      course: { lessonPaymentCount: 12 },
      teachers: [],
    });

    await listener.handle(basePayload());

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('30.04.2026');
    expect(text).not.toContain('soat');
  });

  it('handles multiple teachers (Ustozlar plural label)', async () => {
    prisma.group.findUnique.mockResolvedValue({
      lessonStartTime: '18:30',
      lessonEndTime: null,
      room: null,
      course: { lessonPaymentCount: 20 },
      teachers: [
        { teacher: { firstName: 'Aziz', lastName: 'Toshmatov' } },
        { teacher: { firstName: 'Dilnoza', lastName: 'Saidova' } },
      ],
    });

    await listener.handle(basePayload());

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('Ustozlar');
    expect(text).toContain('Aziz Toshmatov');
    expect(text).toContain('Dilnoza Saidova');
  });

  it('omits room and teacher lines when not assigned', async () => {
    prisma.group.findUnique.mockResolvedValue({
      lessonStartTime: '18:30',
      lessonEndTime: null,
      room: null,
      course: { lessonPaymentCount: 12 },
      teachers: [],
    });

    await listener.handle(basePayload());

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).not.toContain('Xona:');
    expect(text).not.toContain('Ustoz:');
    expect(text).not.toContain('Ustozlar:');
  });

  it('omits the total when course lessonPaymentCount is missing', async () => {
    prisma.group.findUnique.mockResolvedValue({
      lessonStartTime: '18:30',
      lessonEndTime: null,
      room: { name: '201-xona' },
      course: null,
      teachers: [],
    });
    prisma.attendance.count.mockResolvedValue(7);

    await listener.handle(basePayload());

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('Dars:</b> 7');
    expect(text).not.toContain('7 /');
  });

  it('omits the lesson row when student has no attendance count yet', async () => {
    prisma.attendance.count.mockResolvedValue(0);

    await listener.handle(basePayload());

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).not.toContain('Dars:');
  });

  it('does not throw when Telegram API rejects', async () => {
    bot.telegram.sendMessage.mockRejectedValue(
      new Error('Forbidden: bot was blocked'),
    );

    await expect(listener.handle(basePayload())).resolves.toBeUndefined();
  });

  it('counts lessons up to and including the lesson date', async () => {
    await listener.handle(basePayload());

    expect(prisma.attendance.count).toHaveBeenCalledWith({
      where: {
        studentId: 10042,
        groupId: 'g-1',
        date: { lte: new Date('2026-04-30T00:00:00.000Z') },
      },
    });
  });
});

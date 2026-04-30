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
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };
    getBot = jest.fn().mockReturnValue(bot);
    prisma = {
      student: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ telegramChatId: '5550001' }),
      },
      group: {
        findUnique: jest.fn().mockResolvedValue({ lessonStartTime: '18:30' }),
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

  it('sends a PRESENT message to the student via Telegram', async () => {
    await listener.handle(basePayload());

    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, opts] = bot.telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('5550001');
    expect(text).toContain('✅');
    expect(text).toContain('Darsga keldingiz');
    expect(text).toContain('Deutsch A1');
    expect(text).toContain('30.04.2026');
    expect(text).toContain('18:30');
    expect(opts).toEqual({ parse_mode: 'HTML' });
  });

  it('sends a LATE message with the kech-keldingiz wording', async () => {
    await listener.handle(
      basePayload({ newStatus: AttendanceStatus.LATE, oldStatus: null }),
    );

    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('⏰');
    expect(text).toContain('kech keldingiz');
    expect(text).toContain('Deutsch A1');
  });

  it('sends an ABSENT message with the kelmadingiz wording', async () => {
    await listener.handle(
      basePayload({ newStatus: AttendanceStatus.ABSENT, oldStatus: null }),
    );

    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('❌');
    expect(text).toContain('kelmadingiz');
    expect(text).toContain("o'qituvchingiz bilan bog'laning");
  });

  it('does NOT send a Telegram message for EXCUSED', async () => {
    await listener.handle(
      basePayload({ newStatus: AttendanceStatus.EXCUSED, oldStatus: null }),
    );

    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skips silently when the student has no telegramChatId', async () => {
    prisma.student.findUnique.mockResolvedValue({ telegramChatId: null });

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

  it('omits the lesson time line when group has no lessonStartTime', async () => {
    prisma.group.findUnique.mockResolvedValue({ lessonStartTime: null });

    await listener.handle(basePayload());

    const text = bot.telegram.sendMessage.mock.calls[0][1];
    expect(text).toContain('30.04.2026');
    expect(text).not.toContain('soat');
  });

  it('does not throw when Telegram API rejects', async () => {
    bot.telegram.sendMessage.mockRejectedValue(new Error('Forbidden: bot was blocked'));

    await expect(listener.handle(basePayload())).resolves.toBeUndefined();
  });
});

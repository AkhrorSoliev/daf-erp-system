import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceStatus,
  MonthlyChargeStatus,
  PaymentModel,
} from '@prisma/client';
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
      enrollmentMonthlyCharge: {
        findMany: jest.fn().mockResolvedValue([]),
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

  describe("oylik kursda dars raqami o'quvchining o'z oyi bo'yicha (A3.3)", () => {
    // 2026-oktabrning hamma du/chor/ju kunlari — oylik hisobning `coveredDates`i
    // (`lessonDatesInMonth` shunday, o'sish tartibida beradi).
    const OCTOBER = [
      '2026-10-02',
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
      '2026-10-19',
      '2026-10-21',
      '2026-10-23',
      '2026-10-26',
      '2026-10-28',
      '2026-10-30',
    ];

    const groupOf = (paymentModel: PaymentModel) => ({
      lessonStartTime: '18:30',
      lessonEndTime: '20:00',
      room: { name: '201-xona' },
      // `lessonPaymentCount` ham, davomat qatorlari soni ham ataylab oylik
      // hisobdan farq qiladi: son faqat o'quvchining o'z oyidan chiqishi kerak.
      course: { lessonPaymentCount: 8, paymentModel },
      teachers: [],
    });

    const sentText = () => bot.telegram.sendMessage.mock.calls[0][1];

    beforeEach(() => {
      prisma.group.findUnique.mockResolvedValue(groupOf(PaymentModel.MONTHLY));
      prisma.attendance.count.mockResolvedValue(31);
    });

    it('MONTHLY: 6th covered date with the 4th given back reads 5 / 12', async () => {
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        { coveredDates: OCTOBER, frozenOutDates: [OCTOBER[3]] },
      ]);

      await listener.handle(basePayload({ date: OCTOBER[5] }));

      expect(sentText()).toContain('<b>Dars:</b> 5 / 12');
      // Mock so'ralgan ustunlarni emas, bergan qatorini qaytaradi, shuning
      // uchun so'rovning o'zi tekshiriladi: `select`da `frozenOutDates`
      // bo'lmasa, haqiqiy bazada u kelmaydi.
      expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith({
        where: {
          studentId: 10042,
          groupId: 'g-1',
          periodYear: 2026,
          periodMonth: 10,
          status: MonthlyChargeStatus.CHARGED,
        },
        select: { coveredDates: true, frozenOutDates: true },
      });
      // Eski hisob («shu guruhdagi barcha davomat qatorlari») ishlatilmaydi.
      expect(prisma.attendance.count).not.toHaveBeenCalled();
    });

    it('asks the database for the course paymentModel', async () => {
      await listener.handle(basePayload({ date: OCTOBER[5] }));

      // Mock `paymentModel`ni `select`dan qat'i nazar qaytaradi. `select`da u
      // bo'lmasa, haqiqiy bazada hamma kurs LESSON_PACK yo'liga tushadi.
      expect(prisma.group.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            course: {
              select: { lessonPaymentCount: true, paymentModel: true },
            },
          }),
        }),
      );
    });

    it('MONTHLY: the charge that covers the date counts, not an earlier one of the same month', async () => {
      // O'quvchi oy ichida guruhdan chiqib qaytgan: bir oyda ikkita CHARGED hisob.
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        {
          coveredDates: OCTOBER.slice(0, 4),
          frozenOutDates: [OCTOBER[3]],
        },
        { coveredDates: OCTOBER.slice(8), frozenOutDates: [] },
      ]);

      await listener.handle(basePayload({ date: OCTOBER[10] }));

      // OCTOBER[8..12] = 21, 23, 26, 28, 30; 26-sana — shulardan uchinchisi.
      expect(sentText()).toContain('<b>Dars:</b> 3 / 5');
    });

    it.each([
      {
        name: 'no CHARGED charge for the month',
        charges: [],
        date: OCTOBER[5],
      },
      {
        name: 'the date is not covered by any charge',
        charges: [{ coveredDates: OCTOBER, frozenOutDates: [] }],
        date: '2026-10-08',
      },
      {
        name: 'the date was given back (frozen out)',
        charges: [{ coveredDates: OCTOBER, frozenOutDates: [OCTOBER[5]] }],
        date: OCTOBER[5],
      },
    ])('MONTHLY: omits the Dars line when $name', async ({ charges, date }) => {
      prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue(charges);

      await listener.handle(basePayload({ date }));

      expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentText()).not.toContain('Dars:');
    });

    it('LESSON_PACK: stays 5 / 12, counted from attendance rows', async () => {
      prisma.group.findUnique.mockResolvedValue({
        ...groupOf(PaymentModel.LESSON_PACK),
        course: {
          lessonPaymentCount: 12,
          paymentModel: PaymentModel.LESSON_PACK,
        },
      });
      prisma.attendance.count.mockResolvedValue(5);

      await listener.handle(basePayload());

      expect(sentText()).toContain('<b>Dars:</b> 5 / 12');
      expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
    });
  });
});

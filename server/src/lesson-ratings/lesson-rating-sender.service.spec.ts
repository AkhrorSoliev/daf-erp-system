import { Prisma } from '@prisma/client';
import { LessonRatingSenderService } from './lesson-rating-sender.service';

// 2026-10-12 dushanba; dars 08:30–10:00.
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 12, h - 5, m));
};

function setup(
  over: {
    enabled?: boolean;
    attendees?: { id: number; firstName: string; telegramChatId: string }[];
    override?: number[] | null;
    createError?: unknown;
    sendError?: unknown;
  } = {},
) {
  const prisma = {
    group: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'g1',
          name: 'A1-3',
          companyId: 1,
          branchId: 7,
          exactDays: ['monday'],
          lessonStartTime: '08:30',
          lessonEndTime: '10:00',
          startDate: null,
          endDate: null,
        },
      ]),
    },
    lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
    lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (
            over.attendees ?? [
              { id: 10001, firstName: 'Ali', telegramChatId: '555' },
            ]
          ).map((student) => ({ student })),
        ),
    },
    lessonTeacherOverride: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          over.override ? { teacherIds: over.override } : null,
        ),
    },
    groupTeacher: {
      findMany: jest.fn().mockResolvedValue([{ teacherId: 20001 }]),
    },
    user: {
      findMany: jest.fn(
        async ({ where }: { where: { id: { in: number[] } } }) =>
          where.id.in.map((id) => ({
            id,
            firstName: 'Anna',
            lastName: `T${id}`,
          })),
      ),
    },
    lessonRating: {
      create: over.createError
        ? jest.fn().mockRejectedValue(over.createError)
        : jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const holidays = {
    findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
  };
  const settings = { get: jest.fn().mockResolvedValue(over.enabled ?? true) };
  const sendMessage = over.sendError
    ? jest.fn().mockRejectedValue(over.sendError)
    : jest.fn().mockResolvedValue({ message_id: 77 });
  const telegram = { getBot: () => ({ telegram: { sendMessage } }) };
  const service = new LessonRatingSenderService(
    prisma as never,
    holidays as never,
    settings as never,
    telegram as never,
  );
  return { service, prisma, settings, sendMessage };
}

describe('LessonRatingSenderService', () => {
  it('asks a present student 20 minutes after the lesson and keeps the message id', async () => {
    const { service, prisma, sendMessage } = setup();
    await expect(service.run(at('10:20'))).resolves.toBe(1);

    expect(prisma.lessonRating.create).toHaveBeenCalledWith({
      data: {
        companyId: 1,
        branchId: 7,
        groupId: 'g1',
        studentId: 10001,
        date: new Date('2026-10-12T00:00:00.000Z'),
        teacherIds: [20001],
        chatId: '555',
      },
      select: { id: true },
    });
    const [chatId, text, extra] = sendMessage.mock.calls[0] as [
      string,
      string,
      {
        parse_mode: string;
        reply_markup: { inline_keyboard: { callback_data: string }[][] };
      },
    ];
    expect(chatId).toBe('555');
    expect(text).toContain('<b>Ali</b>');
    expect(text).toContain('Ustoz: Anna T20001');
    expect(extra.parse_mode).toBe('HTML');
    expect(extra.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      'lr:r1:1',
    );
    expect(prisma.lessonRating.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { messageId: 77 },
    });
  });

  it('asks only present or late students with a working chat and no rating yet', async () => {
    const { service, prisma } = setup();
    await service.run(at('10:20'));
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'g1',
          date: new Date('2026-10-12T00:00:00.000Z'),
          status: { in: ['PRESENT', 'LATE'] },
          cancellationId: null,
          student: {
            deletedAt: null,
            telegramChatId: { not: null },
            telegramDisconnectedAt: null,
            lessonRatings: {
              none: {
                groupId: 'g1',
                date: new Date('2026-10-12T00:00:00.000Z'),
              },
            },
          },
        },
      }),
    );
  });

  it('waits 10 minutes and stops after 3 hours', async () => {
    const early = setup();
    await expect(early.service.run(at('10:05'))).resolves.toBe(0);
    const late = setup();
    await expect(late.service.run(at('13:30'))).resolves.toBe(0);
    expect(late.prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('does nothing while the setting is off', async () => {
    const { service, prisma } = setup({ enabled: false });
    await expect(service.run(at('10:20'))).resolves.toBe(0);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('takes the substitute teachers of an override', async () => {
    const { service, prisma } = setup({ override: [30001, 30002] });
    await service.run(at('10:20'));
    const [createArg] = prisma.lessonRating.create.mock.calls[0] as [
      { data: { teacherIds: number[] } },
    ];
    expect(createArg.data.teacherIds).toEqual([30001, 30002]);
    expect(prisma.groupTeacher.findMany).not.toHaveBeenCalled();
  });

  it('skips a student another instance already took', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service, sendMessage } = setup({ createError: dup });
    await expect(service.run(at('10:20'))).resolves.toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('marks a refused message FAILED and does not retry', async () => {
    const err = Object.assign(
      new Error('Forbidden: bot was blocked by the user'),
      {
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        },
      },
    );
    const { service, prisma } = setup({ sendError: err });
    await expect(service.run(at('10:20'))).resolves.toBe(0);
    expect(prisma.lessonRating.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        status: 'FAILED',
        failReason: expect.stringContaining('blocked') as string,
      },
    });
  });

  const two = [
    { id: 10001, firstName: 'Ali', telegramChatId: '555' },
    { id: 10002, firstName: 'Vali', telegramChatId: '666' },
  ];

  it('still counts and continues when saving the message id fails', async () => {
    const { service, prisma, sendMessage } = setup({ attendees: two });
    prisma.lessonRating.update.mockRejectedValueOnce(new Error('db down'));
    await expect(service.run(at('10:20'))).resolves.toBe(2);
    expect(prisma.lessonRating.create).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('continues with the next student when create fails unexpectedly', async () => {
    const { service, prisma, sendMessage } = setup({ attendees: two });
    prisma.lessonRating.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.run(at('10:20'))).resolves.toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      '666',
      expect.any(String),
      expect.any(Object),
    );
  });
});

import { GroupPauseMessagesListener } from './group-pause-messages.listener';

describe('GroupPauseMessagesListener', () => {
  let prisma: any;
  let sms: any;
  let holidays: any;
  let listener: GroupPauseMessagesListener;

  const group = {
    name: '#071',
    branchId: 1,
    // Mon, Wed, Fri
    exactDays: ['monday', 'wednesday', 'friday'],
    lessonStartTime: '19:00',
  };

  beforeEach(() => {
    prisma = {
      group: { findFirst: jest.fn().mockResolvedValue(group) },
      enrollment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { student: { id: 11, firstName: 'Ali' } },
            { student: { id: 12, firstName: 'Vali' } },
          ]),
      },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ phone: '901234567' }),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ phone: null }) },
    };
    sms = { sendToStudent: jest.fn().mockResolvedValue({}) };
    holidays = { findActiveHolidayCovering: jest.fn().mockResolvedValue(null) };
    listener = new GroupPauseMessagesListener(prisma, sms, holidays);
  });

  const event = (over: object) => ({
    kind: 'PAUSED' as const,
    groupId: 'g',
    companyId: 1001,
    resumeDay: null,
    ...over,
  });

  it('tells each linked student of the group about a pause', async () => {
    await listener.handle(event({ resumeDay: '2026-11-05' }));

    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          student: { deletedAt: null, telegramChatId: { not: null } },
        }),
      }),
    );
    expect(sms.sendToStudent).toHaveBeenCalledTimes(2);
    const [id, text, type, , companyId] = sms.sendToStudent.mock.calls[0];
    expect([id, type, companyId]).toEqual([11, 'AUTO', 1001]);
    expect(text).toContain('Hurmatli Ali!');
    expect(text).toContain('Darslar <b>05.11</b> dan qayta boshlanadi.');
    expect(text).toContain('+998 90 123 45 67');
  });

  it('names the first lesson on or after the restart day when the group resumes', async () => {
    // 05.11.2026 is a Thursday: the group meets Fri 06.11
    await listener.handle(event({ kind: 'RESUMED', resumeDay: '2026-11-05' }));

    expect(sms.sendToStudent.mock.calls[0][1]).toContain(
      'Birinchi dars: <b>06.11, juma, 19:00</b>.',
    );
  });

  it('counts the restart day itself as the first lesson when the group meets that day', async () => {
    await listener.handle(event({ kind: 'RESUMED', resumeDay: '2026-11-06' }));

    expect(sms.sendToStudent.mock.calls[0][1]).toContain('<b>06.11, juma');
  });

  it('sends the new restart day for RESUME_DAY and nothing without a day', async () => {
    await listener.handle(
      event({ kind: 'RESUME_DAY', resumeDay: '2026-11-12' }),
    );
    expect(sms.sendToStudent.mock.calls[0][1]).toContain('<b>12.11</b>');

    sms.sendToStudent.mockClear();
    await listener.handle(event({ kind: 'RESUME_DAY', resumeDay: null }));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it('keeps going when one student cannot be reached, and never throws', async () => {
    sms.sendToStudent.mockRejectedValueOnce(new Error('403'));
    await expect(listener.handle(event({}))).resolves.toBeUndefined();
    expect(sms.sendToStudent).toHaveBeenCalledTimes(2);

    prisma.group.findFirst.mockRejectedValue(new Error('db'));
    await expect(listener.handle(event({}))).resolves.toBeUndefined();
  });

  it('does nothing for a group that is gone', async () => {
    prisma.group.findFirst.mockResolvedValue(null);
    await listener.handle(event({}));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });
});

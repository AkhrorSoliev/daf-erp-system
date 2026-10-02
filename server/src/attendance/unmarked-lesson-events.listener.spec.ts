import { UnmarkedLessonEventsListener } from './unmarked-lesson-events.listener';

describe('UnmarkedLessonEventsListener', () => {
  const make = () => {
    const prisma = {
      lessonTeacherOverride: { findFirst: jest.fn().mockResolvedValue(null) },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 20001 }]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 20001 }]) },
    } as any;
    const notifications = {
      create: jest.fn().mockResolvedValue({ id: 'n1' }),
    } as any;
    const gateway = { sendToUser: jest.fn() } as any;
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) } as any;
    const digest = { enqueue: jest.fn() } as any;
    return {
      prisma,
      notifications,
      gateway,
      push,
      digest,
      listener: new UnmarkedLessonEventsListener(
        prisma,
        notifications,
        gateway,
        push,
        digest,
      ),
    };
  };
  const payload = {
    companyId: 1,
    groupId: 'g1',
    groupName: '#014',
    date: '2026-09-28',
    teacherPayExempt: false,
  };

  it("tells the lesson's teachers, now and in the 20:00 digest", async () => {
    const m = make();
    await m.listener.handleHeld(payload);
    expect(m.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 20001,
        title: 'Dars haqi yozilmadi',
        message:
          '"#014", 28.09.2026: davomat dars vaqtida olinmagani uchun bu dars haqi yozilmadi.',
      }),
    );
    expect(m.digest.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientKind: 'USER',
        recipientId: 20001,
        category: 'LESSON_PAY_FORFEITED',
        relatedEntityId: 'g1:2026-09-28',
        payload: { groupId: 'g1', groupName: '#014', date: '2026-09-28' },
      }),
    );
  });

  it('tells the substitute when one taught the lesson', async () => {
    const m = make();
    m.prisma.lessonTeacherOverride.findFirst.mockResolvedValue({
      teacherIds: [20009],
    });
    m.prisma.user.findMany.mockResolvedValue([{ id: 20009 }]);
    await m.listener.handleHeld(payload);
    expect(m.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [20009] } }),
      }),
    );
  });

  it('says nothing for an exempt lesson', async () => {
    const m = make();
    await m.listener.handleHeld({ ...payload, teacherPayExempt: true });
    expect(m.notifications.create).not.toHaveBeenCalled();
  });
});

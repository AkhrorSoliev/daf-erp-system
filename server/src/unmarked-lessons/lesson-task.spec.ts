import {
  claimSystemTask,
  closeLessonTask,
  createLessonTask,
  lessonTaskAssigneeIds,
  lessonTaskText,
  nextWorkingDay,
  taskDueAt,
} from './lesson-task';

describe('nextWorkingDay', () => {
  it('skips Sunday and holidays', () => {
    expect(nextWorkingDay('2026-09-26', new Set())).toBe('2026-09-28'); // Sat → Mon
    expect(nextWorkingDay('2026-09-29', new Set(['2026-09-30']))).toBe(
      '2026-10-01',
    );
  });
});

describe('taskDueAt', () => {
  it('is 10:00 Tashkent on that day', () => {
    expect(taskDueAt('2026-10-01').toISOString()).toBe(
      '2026-10-01T05:00:00.000Z',
    );
  });
});

describe('lessonTaskText', () => {
  it('names the group, day and time', () => {
    expect(
      lessonTaskText({
        groupName: '#014',
        dateStr: '2026-09-29',
        startTime: '16:00',
        endTime: '17:30',
      }),
    ).toBe("#014, 29.09.2026 16:00–17:30: davomat olinmadi. Dars bo'ldimi?");
  });
});

describe('lessonTaskAssigneeIds', () => {
  it('asks administrators, then directors, then CEOs', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7 }]);
    expect(
      await lessonTaskAssigneeIds({ user: { findMany } } as any, 1, 2),
    ).toEqual([7]);
    expect(findMany.mock.calls[0][0].where.roles).toEqual({
      some: { role: { name: 'Administrator' } },
    });
    expect(findMany.mock.calls[1][0].where.roles).toEqual({
      some: { role: { name: 'Branch Director' } },
    });
    expect(findMany.mock.calls[2][0].where.roles).toEqual({
      some: { role: { name: 'CEO' } },
    });
  });

  it('stops at the first role that has someone', async () => {
    const findMany = jest.fn().mockResolvedValueOnce([{ id: 3 }, { id: 4 }]);
    expect(
      await lessonTaskAssigneeIds({ user: { findMany } } as any, 1, 2),
    ).toEqual([3, 4]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe('createLessonTask', () => {
  const args = {
    companyId: 1,
    branchId: 2,
    groupId: 'g1',
    groupName: '#014',
    dateStr: '2026-09-29',
    startTime: '16:00',
    endTime: '17:30',
    dueAt: new Date('2026-09-30T05:00:00.000Z'),
  };

  it('writes an author-less system task for every administrator', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]) },
      comment: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    } as any;
    expect(await createLessonTask(tx, args)).toBe('c1');
    expect(tx.comment.create).toHaveBeenCalledWith({
      data: {
        entityType: 'Group',
        entityId: 'g1',
        content:
          "#014, 29.09.2026 16:00–17:30: davomat olinmadi. Dars bo'ldimi?",
        isTask: true,
        isSystem: true,
        authorId: null,
        dueDate: args.dueAt,
        priority: 'HIGH',
        companyId: 1,
        assignees: {
          create: [
            { userId: 3, status: 'PENDING' },
            { userId: 4, status: 'PENDING' },
          ],
        },
      },
      select: { id: true },
    });
  });

  it('writes nothing when nobody can take it', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      comment: { create: jest.fn() },
    } as any;
    expect(await createLessonTask(tx, args)).toBeNull();
    expect(tx.comment.create).not.toHaveBeenCalled();
  });
});

describe('closeLessonTask', () => {
  const tx = () =>
    ({
      commentAssignee: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    }) as any;

  it('lets an answering administrator take it and closes their copy', async () => {
    const t = tx();
    t.commentAssignee.findUnique.mockResolvedValue({ id: 'a3', seenAt: null });
    await closeLessonTask(t, 'c1', 3);
    expect(t.commentAssignee.deleteMany).toHaveBeenCalledWith({
      where: { commentId: 'c1', userId: { not: 3 } },
    });
    expect(t.commentAssignee.update).toHaveBeenCalledWith({
      where: { id: 'a3' },
      data: {
        status: 'DONE',
        doneAt: expect.any(Date),
        seenAt: expect.any(Date),
      },
    });
  });

  it('closes every copy when a director or the CEO answers', async () => {
    const t = tx();
    t.commentAssignee.findUnique.mockResolvedValue(null);
    await closeLessonTask(t, 'c1', 9);
    expect(t.commentAssignee.updateMany).toHaveBeenCalledWith({
      where: { commentId: 'c1', status: { not: 'DONE' } },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
  });

  it('does nothing without a task', async () => {
    const t = tx();
    await closeLessonTask(t, null, 3);
    expect(t.commentAssignee.findUnique).not.toHaveBeenCalled();
  });
});

describe('claimSystemTask', () => {
  it('removes the other copies and records who took it', async () => {
    const t = {
      commentAssignee: {
        findMany: jest.fn().mockResolvedValue([{ userId: 3 }, { userId: 4 }]),
        deleteMany: jest.fn(),
      },
      unmarkedLesson: { updateMany: jest.fn() },
    } as any;
    expect(await claimSystemTask(t, 'c1', 3)).toBe(true);
    expect(t.commentAssignee.deleteMany).toHaveBeenCalledWith({
      where: { commentId: 'c1', userId: { not: 3 } },
    });
    expect(t.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskCommentId: 'c1' },
      data: { claimedById: 3 },
    });
  });

  it('refuses someone who is not on it', async () => {
    const t = {
      commentAssignee: {
        findMany: jest.fn().mockResolvedValue([{ userId: 4 }]),
        deleteMany: jest.fn(),
      },
      unmarkedLesson: { updateMany: jest.fn() },
    } as any;
    expect(await claimSystemTask(t, 'c1', 3)).toBe(false);
    expect(t.commentAssignee.deleteMany).not.toHaveBeenCalled();
  });
});

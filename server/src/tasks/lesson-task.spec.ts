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

  it('writes an author-less LESSON_QUESTION task for every administrator', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]) },
      task: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
      taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
    } as any;
    expect(await createLessonTask(tx, args)).toBe('t1');
    expect(tx.task.create).toHaveBeenCalledWith({
      data: {
        companyId: 1,
        branchId: 2,
        kind: 'LESSON_QUESTION',
        title: "#014, 29.09.2026 16:00–17:30: davomat olinmadi. Dars bo'ldimi?",
        priority: 'HIGH',
        dueAt: args.dueAt,
        authorId: null,
        entityType: 'Group',
        entityId: 'g1',
        sourceKey: 'unmarked:g1:2026-09-29',
        participants: {
          create: [
            { userId: 3, role: 'ASSIGNEE' },
            { userId: 4, role: 'ASSIGNEE' },
          ],
        },
        events: {
          create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }],
        },
      },
      select: { id: true },
    });
  });

  it('queues the reminder an hour before the deadline and the overdue notice at it, for every administrator', async () => {
    const dueAt = new Date(Date.now() + 3 * 3_600_000);
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]) },
      task: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
      taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
    } as any;
    await createLessonTask(tx, { ...args, dueAt });
    const { data } = tx.taskOutbox.createMany.mock.calls[0][0];
    const reminderAt = new Date(dueAt.getTime() - 3_600_000);
    expect(data).toEqual(
      expect.arrayContaining([
        {
          taskId: 't1',
          userId: 3,
          channel: 'INAPP',
          kind: 'REMINDER',
          sendAfter: reminderAt,
        },
        {
          taskId: 't1',
          userId: 4,
          channel: 'INAPP',
          kind: 'REMINDER',
          sendAfter: reminderAt,
        },
        {
          taskId: 't1',
          userId: 3,
          channel: 'INAPP',
          kind: 'OVERDUE',
          sendAfter: dueAt,
        },
        {
          taskId: 't1',
          userId: 4,
          channel: 'INAPP',
          kind: 'OVERDUE',
          sendAfter: dueAt,
        },
      ]),
    );
    // No author on a system task, so nobody but the assignees is told.
    expect(data).toHaveLength(4);
  });

  it('writes nothing when nobody can take it', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      task: { create: jest.fn() },
    } as any;
    expect(await createLessonTask(tx, args)).toBeNull();
    expect(tx.task.create).not.toHaveBeenCalled();
  });
});

describe('closeLessonTask', () => {
  const tx = (assignees: number[] = []) =>
    ({
      taskParticipant: {
        findMany: jest
          .fn()
          .mockResolvedValue(assignees.map((userId) => ({ userId }))),
        deleteMany: jest.fn(),
      },
      task: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      taskEvent: { create: jest.fn() },
      taskOutbox: { deleteMany: jest.fn() },
      unmarkedLesson: { updateMany: jest.fn() },
    }) as any;

  it('lets an answering administrator take it and closes it', async () => {
    const t = tx([3, 4]);
    await closeLessonTask(t, 't1', 3);
    expect(t.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
    });
    // The claim already wrote the holder on the task; the close does not.
    expect(t.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedById: 3 },
    });
    expect(t.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } },
      data: { status: 'DONE', closedAt: expect.any(Date) },
    });
    expect(t.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        type: 'AUTO_CLOSED',
        actorId: 3,
        meta: { reason: 'LESSON_ANSWERED' },
        via: 'SYSTEM',
      },
    });
    expect(t.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
  });

  it("records the answerer as the holder, so a later «Ko'rdim» by another administrator is told who took it", async () => {
    const t = tx([3, 4]);
    await closeLessonTask(t, 't1', 3);
    expect(t.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { claimedById: 3 },
    });
    // The lesson row is taken before the other copies go, like a claim.
    expect(
      t.unmarkedLesson.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(t.taskParticipant.deleteMany.mock.invocationCallOrder[0]);
  });

  it('closes it for everyone when a director or the CEO answers', async () => {
    const t = tx([4]);
    await closeLessonTask(t, 't1', 9);
    expect(t.taskParticipant.deleteMany).not.toHaveBeenCalled();
    expect(t.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { claimedById: 9 },
    });
    expect(t.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } },
      data: { status: 'DONE', closedAt: expect.any(Date), claimedById: 9 },
    });
  });

  it('leaves the holder alone when the system closes it (cron, deleted group)', async () => {
    const t = tx([3, 4]);
    await closeLessonTask(t, 't1', null);
    expect(t.taskParticipant.findMany).not.toHaveBeenCalled();
    expect(t.unmarkedLesson.updateMany).not.toHaveBeenCalled();
    expect(t.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } },
      data: { status: 'DONE', closedAt: expect.any(Date) },
    });
    expect(t.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        type: 'AUTO_CLOSED',
        meta: { reason: 'GROUP_DELETED' },
      }),
    });
  });

  it('writes no «closed» event for a task that was already closed', async () => {
    const t = tx([3]);
    t.task.updateMany.mockResolvedValue({ count: 0 });
    await closeLessonTask(t, 't1', 3);
    expect(t.taskEvent.create).not.toHaveBeenCalled();
    // Pending reminders still go.
    expect(t.taskOutbox.deleteMany).toHaveBeenCalled();
  });

  it('does nothing without a task', async () => {
    const t = tx();
    await closeLessonTask(t, null, 3);
    expect(t.taskParticipant.findMany).not.toHaveBeenCalled();
    expect(t.task.updateMany).not.toHaveBeenCalled();
    expect(t.unmarkedLesson.updateMany).not.toHaveBeenCalled();
  });
});

describe('claimSystemTask', () => {
  const tx = (assignees: number[]) =>
    ({
      taskParticipant: {
        findMany: jest
          .fn()
          .mockResolvedValue(assignees.map((userId) => ({ userId }))),
        deleteMany: jest.fn(),
      },
      task: { update: jest.fn() },
      taskOutbox: { deleteMany: jest.fn() },
      unmarkedLesson: { updateMany: jest.fn() },
    }) as any;

  it('removes the other assignees and records who took it', async () => {
    const t = tx([3, 4]);
    expect(await claimSystemTask(t, 't1', 3)).toBe(true);
    expect(t.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
    });
    expect(t.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { claimedById: 3 },
    });
    expect(t.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedById: 3 },
    });
  });

  it('takes the removed assignees’ unsent reminders with them', async () => {
    const t = tx([3, 4, 5]);
    await claimSystemTask(t, 't1', 3);
    expect(t.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: { in: [4, 5] }, sentAt: null },
    });
  });

  it('queues on the lesson row before touching the other assignees', async () => {
    // Two administrators pressing at once each delete the other's copy and
    // then wait on the lesson row: a deadlock. Taking the lesson row first
    // makes every claimer queue on one row; the loser fails as a plain
    // serialization conflict instead.
    const t = tx([3, 4]);
    await claimSystemTask(t, 't1', 3);
    expect(
      t.unmarkedLesson.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(t.taskParticipant.deleteMany.mock.invocationCallOrder[0]);
  });

  it('refuses someone who is not on it', async () => {
    const t = tx([4]);
    expect(await claimSystemTask(t, 't1', 3)).toBe(false);
    expect(t.taskParticipant.deleteMany).not.toHaveBeenCalled();
    expect(t.taskOutbox.deleteMany).not.toHaveBeenCalled();
    expect(t.task.update).not.toHaveBeenCalled();
  });
});

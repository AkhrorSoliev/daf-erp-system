import { TaskUserLifecycleListener } from './task-user-lifecycle.listener';

const LEAVER = 20;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    companyId: 1,
    branchId: 2,
    kind: 'MANUAL',
    title: 'Hisobotni yuboring',
    status: 'IN_PROGRESS',
    authorId: 5,
    dueAt: null,
    claimedById: null,
    participants: [{ userId: LEAVER, role: 'ASSIGNEE' }],
    ...over,
  };
}

function setup(rows: unknown[]) {
  const tx = {
    taskParticipant: { deleteMany: jest.fn(), createMany: jest.fn() },
    taskEvent: { create: jest.fn() },
    taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
    task: { update: jest.fn() },
    unmarkedLesson: { updateMany: jest.fn() },
  };
  const prisma = {
    task: { findMany: jest.fn().mockResolvedValue(rows) },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 77 }]),
      // The author is still an active employee unless a test says otherwise.
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const emitter = { emit: jest.fn() };
  const listener = new TaskUserLifecycleListener(prisma as any, emitter as any);
  return { listener, prisma, tx, emitter };
}

const event = { userId: LEAVER, companyId: 1 };

describe('TaskUserLifecycleListener', () => {
  it('looks only at open tasks of the company the person is on', async () => {
    const { listener, prisma } = setup([]);
    await listener.onDeactivated(event);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1,
          status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] },
          participants: { some: { userId: LEAVER } },
        },
      }),
    );
  });

  it('gives a sole manual assignee’s task back to its author and says so', async () => {
    const { listener, tx, emitter } = setup([row()]);
    await listener.onDeactivated(event);

    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: LEAVER },
    });
    expect(tx.taskParticipant.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 't1', userId: 5, role: 'ASSIGNEE' }],
      skipDuplicates: true,
    });
    expect(tx.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        type: 'REASSIGNED',
        actorId: null,
        meta: { from: LEAVER, to: [5] },
        via: 'SYSTEM',
      },
    });
    expect(tx.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: LEAVER, sentAt: null },
    });
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    expect(emitter.emit).toHaveBeenCalledWith(
      'task.reassigned',
      expect.objectContaining({
        fromUserId: LEAVER,
        toUserIds: [5],
        task: expect.objectContaining({
          id: 't1',
          participants: [{ userId: 5, role: 'ASSIGNEE' }],
        }),
      }),
    );
  });

  it('only removes one of two assignees and emits nothing', async () => {
    const { listener, tx, emitter } = setup([
      row({
        participants: [
          { userId: LEAVER, role: 'ASSIGNEE' },
          { userId: 30, role: 'ASSIGNEE' },
        ],
      }),
    ]);
    await listener.onDeactivated(event);

    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: LEAVER },
    });
    expect(tx.taskParticipant.createMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('hands a sole-assignee «Dars bo‘ldimi?» question to whoever it is asked of', async () => {
    const { listener, prisma, tx, emitter } = setup([
      row({ kind: 'LESSON_QUESTION', authorId: null }),
    ]);
    await listener.onDeactivated(event);

    // lessonTaskAssigneeIds went to the branch's administrators.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(tx.taskParticipant.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 't1', userId: 77, role: 'ASSIGNEE' }],
      skipDuplicates: true,
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      'task.reassigned',
      expect.objectContaining({ toUserIds: [77] }),
    );
  });

  it('never gives the task back to the person who is leaving', async () => {
    const { listener, prisma, tx, emitter } = setup([
      row({ kind: 'LESSON_QUESTION', authorId: null }),
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: LEAVER }]);
    await listener.onDeactivated(event);

    expect(tx.taskParticipant.createMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('a watcher leaving is just removed', async () => {
    const { listener, tx, emitter } = setup([
      row({
        participants: [
          { userId: 30, role: 'ASSIGNEE' },
          { userId: LEAVER, role: 'WATCHER' },
        ],
      }),
    ]);
    await listener.onDeactivated(event);
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalled();
    expect(tx.taskParticipant.createMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('logs and swallows a failure, so the deactivation itself is never undone', async () => {
    const { listener, prisma } = setup([]);
    prisma.task.findMany.mockRejectedValue(new Error('db down'));
    await expect(listener.onDeactivated(event)).resolves.toBeUndefined();
  });

  it('one failing task does not skip the leaver’s other tasks', async () => {
    const { listener, prisma, tx, emitter } = setup([
      row({ id: 't1' }),
      row({ id: 't2' }),
    ]);
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error('deadlock'),
    );
    await expect(listener.onDeactivated(event)).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't2', userId: LEAVER },
    });
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('a system task the leaver had taken is up for grabs again', async () => {
    const { listener, tx } = setup([
      row({
        kind: 'LESSON_QUESTION',
        authorId: null,
        claimedById: LEAVER,
      }),
    ]);
    await listener.onDeactivated(event);

    expect(tx.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { claimedById: null },
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedById: null },
    });
    // The lesson row first, like every claim.
    expect(
      tx.unmarkedLesson.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.taskParticipant.deleteMany.mock.invocationCallOrder[0]);
  });

  it('leaves the holder alone when someone else took the system task, and on a manual task', async () => {
    const { listener, tx } = setup([
      row({
        id: 't1',
        kind: 'LESSON_QUESTION',
        authorId: null,
        claimedById: 99,
        participants: [
          { userId: LEAVER, role: 'WATCHER' },
          { userId: 99, role: 'ASSIGNEE' },
        ],
      }),
      row({ id: 't2', claimedById: LEAVER }),
    ]);
    await listener.onDeactivated(event);
    expect(tx.unmarkedLesson.updateMany).not.toHaveBeenCalled();
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it('when the leaver is also the author, a manual task goes to the branch’s lesson-question assignees', async () => {
    const { listener, tx, emitter } = setup([row({ authorId: LEAVER })]);
    await listener.onDeactivated(event);

    expect(tx.taskParticipant.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 't1', userId: 77, role: 'ASSIGNEE' }],
      skipDuplicates: true,
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      'task.reassigned',
      expect.objectContaining({ fromUserId: LEAVER, toUserIds: [77] }),
    );
  });

  it('when the author has left too, a manual task goes to the branch’s lesson-question assignees', async () => {
    const { listener, prisma, tx } = setup([row({ authorId: 5 })]);
    prisma.user.count.mockResolvedValue(0);
    await listener.onDeactivated(event);

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 5,
        deletedAt: null,
        isActive: true,
      }),
    });
    expect(tx.taskParticipant.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 't1', userId: 77, role: 'ASSIGNEE' }],
      skipDuplicates: true,
    });
  });

  it('a task with no branch and no author to return it to is left without an assignee', async () => {
    const { listener, prisma, tx, emitter } = setup([
      row({ authorId: LEAVER, branchId: null }),
    ]);
    await listener.onDeactivated(event);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: LEAVER },
    });
    expect(tx.taskParticipant.createMany).not.toHaveBeenCalled();
    expect(tx.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ meta: { from: LEAVER, to: [] } }),
    });
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('gives the new assignee the reminders the leaver had', async () => {
    const dueAt = new Date(Date.now() + 3 * 3_600_000);
    const { listener, tx } = setup([
      row({ kind: 'LESSON_QUESTION', authorId: null, dueAt }),
    ]);
    await listener.onDeactivated(event);

    // The task's rows are rewritten for the new set of assignees.
    expect(tx.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
    });
    const { data } = tx.taskOutbox.createMany.mock.calls[0][0];
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 77, kind: 'REMINDER' }),
        expect.objectContaining({ userId: 77, kind: 'OVERDUE' }),
      ]),
    );
  });
});

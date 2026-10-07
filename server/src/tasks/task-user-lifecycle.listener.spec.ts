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
    participants: [{ userId: LEAVER, role: 'ASSIGNEE' }],
    ...over,
  };
}

function setup(rows: unknown[]) {
  const tx = {
    taskParticipant: { deleteMany: jest.fn(), createMany: jest.fn() },
    taskEvent: { create: jest.fn() },
    taskOutbox: { deleteMany: jest.fn() },
  };
  const prisma = {
    task: { findMany: jest.fn().mockResolvedValue(rows) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 77 }]) },
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
});

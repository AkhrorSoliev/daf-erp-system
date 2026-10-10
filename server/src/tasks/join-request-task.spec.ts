import {
  closeJoinRequestTask,
  createJoinRequestTask,
  joinRequestTaskTitle,
} from './join-request-task';

describe('joinRequestTaskTitle', () => {
  it('names the person and the group', () => {
    expect(
      joinRequestTaskTitle({
        firstName: 'Dilnoza',
        lastName: 'Aliyeva',
        groupName: 'A1-07',
      }),
    ).toBe("Yangi o'quvchi so'rovi: Dilnoza Aliyeva → A1-07");
  });
});

describe('createJoinRequestTask', () => {
  const args = {
    companyId: 1001,
    branchId: 2,
    groupId: 'g1',
    requestId: 'r1',
    title: "Yangi o'quvchi so'rovi: Dilnoza Aliyeva → A1-07",
    dueAt: new Date(Date.now() + 26 * 3_600_000),
  };

  const tx = (adminIds: number[]) =>
    ({
      user: {
        findMany: jest.fn().mockResolvedValue(adminIds.map((id) => ({ id }))),
      },
      task: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
      taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
    }) as any;

  it('writes an author-less JOIN_REQUEST task for every administrator of the branch', async () => {
    const t = tx([3, 4]);
    const made = await createJoinRequestTask(t, args);

    expect(t.task.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: 2,
        kind: 'JOIN_REQUEST',
        title: args.title,
        priority: 'HIGH',
        dueAt: args.dueAt,
        authorId: null,
        entityType: 'Group',
        entityId: 'g1',
        sourceKey: 'join:r1',
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
    expect(made).toEqual({
      id: 't1',
      assigneeIds: [3, 4],
      eventTask: {
        id: 't1',
        companyId: 1001,
        title: args.title,
        kind: 'JOIN_REQUEST',
        authorId: null,
        dueAt: args.dueAt,
        status: 'NEW',
        participants: [
          { userId: 3, role: 'ASSIGNEE' },
          { userId: 4, role: 'ASSIGNEE' },
        ],
      },
    });
  });

  it('queues the reminder and the overdue notice, Telegram included', async () => {
    const t = tx([3]);
    await createJoinRequestTask(t, args);
    const rows = t.taskOutbox.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 3,
          channel: 'INAPP',
          kind: 'REMINDER',
        }),
        expect.objectContaining({
          userId: 3,
          channel: 'TELEGRAM',
          kind: 'OVERDUE',
        }),
      ]),
    );
  });

  it('writes nothing when nobody can take it', async () => {
    const t = tx([]);
    t.user.findMany.mockResolvedValue([]);
    expect(await createJoinRequestTask(t, args)).toBeNull();
    expect(t.task.create).not.toHaveBeenCalled();
  });
});

describe('closeJoinRequestTask', () => {
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

  it('lets the deciding administrator take it, then closes it', async () => {
    const t = tx([3, 4]);
    await closeJoinRequestTask(t, 't1', 3, 'JOIN_APPROVED');
    expect(t.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
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
        meta: { reason: 'JOIN_APPROVED' },
        via: 'SYSTEM',
      },
    });
    expect(t.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
  });

  it('records a director or the CEO as the holder when they decide', async () => {
    const t = tx([3, 4]);
    await closeJoinRequestTask(t, 't1', 10000, 'JOIN_REJECTED');
    expect(t.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } },
      data: { status: 'DONE', closedAt: expect.any(Date), claimedById: 10000 },
    });
  });

  it('closes it with no holder when the system does (expiry, replacement)', async () => {
    const t = tx([3]);
    await closeJoinRequestTask(t, 't1', null, 'JOIN_EXPIRED');
    expect(t.taskParticipant.findMany).not.toHaveBeenCalled();
    expect(t.task.updateMany.mock.calls[0][0].data).toEqual({
      status: 'DONE',
      closedAt: expect.any(Date),
    });
  });

  it('writes no closing event for a task already closed', async () => {
    const t = tx([3]);
    t.task.updateMany.mockResolvedValue({ count: 0 });
    await closeJoinRequestTask(t, 't1', null, 'JOIN_EXPIRED');
    expect(t.taskEvent.create).not.toHaveBeenCalled();
  });

  it('does nothing without a task', async () => {
    const t = tx();
    await closeJoinRequestTask(t, null, 3, 'JOIN_APPROVED');
    expect(t.task.updateMany).not.toHaveBeenCalled();
  });
});

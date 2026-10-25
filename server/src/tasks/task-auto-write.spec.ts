import { Logger } from '@nestjs/common';
import { autoCloseTasks, createSystemTask } from './task-auto-write';

const OPEN = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'];
const NOW = new Date('2026-10-12T04:00:00.000Z'); // Mon 09:00 Tashkent
const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  companyId: 1,
  title: 'X',
  kind: 'BROKEN_PROMISE',
  authorId: null,
  dueAt: new Date('2026-10-12T13:00:00.000Z'),
  status: 'NEW',
  participants: [
    { userId: 3, role: 'ASSIGNEE' },
    { userId: 4, role: 'ASSIGNEE' },
  ],
  ...over,
});

function fake() {
  const tx = {
    task: {
      create: jest.fn().mockResolvedValue(row()),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(row({ status: 'DONE' })),
    },
    taskEvent: { create: jest.fn() },
    taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
    taskParticipant: {
      findMany: jest.fn().mockResolvedValue([{ userId: 3 }, { userId: 4 }]),
      deleteMany: jest.fn(),
    },
    unmarkedLesson: { updateMany: jest.fn() },
  };
  const prisma = {
    task: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ id: 't1' }]),
    },
    $transaction: jest.fn(
      async (fn: (t: typeof tx) => unknown): Promise<unknown> => fn(tx),
    ),
  };
  return { prisma, tx };
}

const input = {
  companyId: 1,
  branchId: 2,
  kind: 'BROKEN_PROMISE' as const,
  title: "Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm",
  description: "Va'da sanasi: 09.10.2026",
  dueAt: new Date('2026-10-12T13:00:00.000Z'),
  entityId: '10001',
  sourceKey: 'promise:p1',
  assigneeIds: [3, 4],
};

describe('createSystemTask', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("writes a Tizim task with the rule's priority and entity, its assignees and its time rows", async () => {
    const { prisma, tx } = fake();
    const t = await createSystemTask(prisma as any, input);
    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 1,
          branchId: 2,
          kind: 'BROKEN_PROMISE',
          priority: 'HIGH',
          authorId: null,
          entityType: 'Student',
          entityId: '10001',
          sourceKey: 'promise:p1',
          title: input.title,
          description: input.description,
          dueAt: input.dueAt,
          participants: {
            create: [
              { userId: 3, role: 'ASSIGNEE' },
              { userId: 4, role: 'ASSIGNEE' },
            ],
          },
          events: {
            create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }],
          },
        }),
      }),
    );
    // REMINDER at 17:00 and OVERDUE at 18:00, in-app and Telegram.
    const rows = (
      tx.taskOutbox.createMany.mock.calls[0][0] as {
        data: { channel: string; kind: string; userId: number }[];
      }
    ).data;
    for (const channel of ['INAPP', 'TELEGRAM']) {
      for (const kind of ['REMINDER', 'OVERDUE']) {
        expect(
          rows
            .filter((r) => r.channel === channel && r.kind === kind)
            .map((r) => r.userId)
            .sort(),
        ).toEqual([3, 4]);
      }
    }
    expect(rows).toHaveLength(8);
    expect(t).toMatchObject({
      id: 't1',
      kind: 'BROKEN_PROMISE',
      authorId: null,
    });
  });

  it('writes nothing while the source already has an open task (a re-run)', async () => {
    const { prisma } = fake();
    prisma.task.findFirst.mockResolvedValue({ id: 't0' });
    expect(await createSystemTask(prisma as any, input)).toBeNull();
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { sourceKey: 'promise:p1', status: { in: OPEN } },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a repeated assignee id is written once, not swallowed as "already open"', async () => {
    const { prisma, tx } = fake();
    const t = await createSystemTask(prisma as any, {
      ...input,
      assigneeIds: [3, 4, 3],
    });
    expect(t).not.toBeNull();
    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participants: {
            create: [
              { userId: 3, role: 'ASSIGNEE' },
              { userId: 4, role: 'ASSIGNEE' },
            ],
          },
        }),
      }),
    );
  });

  it('writes nothing when nobody can take it', async () => {
    const { prisma } = fake();
    expect(
      await createSystemTask(prisma as any, { ...input, assigneeIds: [] }),
    ).toBeNull();
    expect(prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it('a concurrent run that won the unique index is not an error', async () => {
    const { prisma } = fake();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    expect(await createSystemTask(prisma as any, input)).toBeNull();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { cause: { code: '23505' } }),
    );
    expect(await createSystemTask(prisma as any, input)).toBeNull();
  });

  it('any other failure is thrown', async () => {
    const { prisma } = fake();
    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(createSystemTask(prisma as any, input)).rejects.toThrow(
      'boom',
    );
  });
});

describe('autoCloseTasks', () => {
  it('closes only open automatic tasks, with the reason, and drops their unsent rows', async () => {
    const { prisma, tx } = fake();
    const closed = await autoCloseTasks(
      prisma as any,
      { companyId: 1, entityType: 'Student', entityId: '10001' },
      'PAYMENT_RECEIVED',
      NOW,
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { companyId: 1, entityType: 'Student', entityId: '10001' },
          {
            kind: {
              in: ['BROKEN_PROMISE', 'CALLBACK', 'UNCALLED_LEAD', 'HELD_MONTH'],
            },
          },
          { status: { in: OPEN } },
        ],
      },
      select: { id: true },
    });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: OPEN } },
      data: { status: 'DONE', closedAt: NOW },
    });
    expect(tx.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        type: 'AUTO_CLOSED',
        actorId: null,
        meta: { reason: 'PAYMENT_RECEIVED' },
        via: 'SYSTEM',
      },
    });
    // Also what stops a Telegram notice held for 08:00.
    expect(tx.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
    expect(tx.task.update).not.toHaveBeenCalled();
    expect(closed).toEqual([
      expect.objectContaining({ id: 't1', status: 'DONE' }),
    ]);
  });

  it('a task someone else closed meanwhile is left alone', async () => {
    const { prisma, tx } = fake();
    tx.task.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await autoCloseTasks(prisma as any, {}, 'LEAD_GONE', NOW, 3),
    ).toEqual([]);
    expect(tx.taskEvent.create).not.toHaveBeenCalled();
    expect(tx.taskParticipant.findMany).not.toHaveBeenCalled();
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it("an assignee who did the job takes the task: the others' copies go", async () => {
    const { prisma, tx } = fake();
    await autoCloseTasks(prisma as any, {}, 'CALL_LOGGED', NOW, 3);
    expect(tx.task.update).toHaveBeenCalledTimes(1);
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedById: 3 },
    });
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
    });
    expect(tx.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 3 }),
    });
  });

  it('the payload keeps the assignees the claim removed (card read before it)', async () => {
    const { prisma, tx } = fake();
    const closed = await autoCloseTasks(
      prisma as any,
      {},
      'CALL_LOGGED',
      NOW,
      3,
    );
    expect(closed[0].participants.map((p) => p.userId)).toEqual([3, 4]);
    expect(tx.task.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      tx.taskParticipant.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it('someone who is not an assignee is recorded as the holder, only if nobody holds it', async () => {
    const { prisma, tx } = fake();
    await autoCloseTasks(prisma as any, {}, 'PAYMENT_RECEIVED', NOW, 9);
    expect(tx.task.updateMany).toHaveBeenLastCalledWith({
      where: { id: 't1', claimedById: null },
      data: { claimedById: 9 },
    });
    expect(tx.task.update).not.toHaveBeenCalled();
    expect(tx.taskParticipant.deleteMany).not.toHaveBeenCalled();
    expect(tx.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 9 }),
    });
  });

  it('one task failing does not lose the others that closed', async () => {
    const { prisma, tx } = fake();
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.task.findMany.mockResolvedValue([
      { id: 't1' },
      { id: 't2' },
      { id: 't3' },
    ]);
    const run = async (fn: (t: typeof tx) => unknown): Promise<unknown> =>
      fn(tx);
    prisma.$transaction
      .mockImplementationOnce(run)
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockImplementationOnce(run);
    tx.task.findUnique
      .mockResolvedValueOnce(row({ id: 't1', status: 'DONE' }))
      .mockResolvedValueOnce(row({ id: 't3', status: 'DONE' }));
    const closed = await autoCloseTasks(
      prisma as any,
      {},
      'PAYMENT_RECEIVED',
      NOW,
    );
    expect(closed.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('t2'));
    error.mockRestore();
  });
});

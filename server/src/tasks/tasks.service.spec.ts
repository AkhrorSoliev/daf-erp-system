import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService, claimSystemTask, parseDueInput } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { TaskOutboxService } from './task-outbox.service';
import { TASK_EVENTS } from './task-events';

const ADMIN = {
  id: 30,
  companyId: 1,
  roles: [{ role: { id: 3, name: 'Administrator' } }],
  branches: [{ branchId: 1 }],
  mainBranch: 1,
  deletedAt: null,
  status: 'ACTIVE',
  isActive: true,
  telegramChatId: null,
  firstName: 'A',
  lastName: 'B',
  photo: null,
};
const TEACHER = {
  ...ADMIN,
  id: 40,
  roles: [{ role: { id: 4, name: 'Teacher' } }],
};
const BD_OTHER = {
  ...ADMIN,
  id: 20,
  roles: [{ role: { id: 2, name: 'Branch Director' } }],
  branches: [{ branchId: 2 }],
  mainBranch: 2,
};

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    companyId: 1,
    branchId: 1,
    kind: 'MANUAL',
    title: 'X',
    status: 'NEW',
    priority: 'MEDIUM',
    dueAt: null,
    authorId: 30,
    entityType: null,
    entityId: null,
    requiresPhoto: false,
    batchId: null,
    sourceKey: null,
    claimedById: null,
    returnedCount: 0,
    startedAt: null,
    reviewRequestedAt: null,
    closedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    description: null,
    lastReturnedAt: null,
    cancelReason: null,
    author: { id: 30, firstName: 'A', lastName: 'B', photo: null },
    participants: [
      {
        userId: 40,
        role: 'ASSIGNEE',
        seenAt: null,
        user: { id: 40, firstName: 'T', lastName: 'U', photo: null },
      },
    ],
    _count: { steps: 0, events: 1 },
    steps: [],
    unmarkedLesson: null,
    ...over,
  };
}

let service: TasksService;
let prisma: any;
let emitter: { emit: jest.Mock };
let outbox: { schedule: jest.Mock };
let holidays: { buildHolidayDateSet: jest.Mock };

beforeEach(async () => {
  prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([TEACHER]),
      findFirst: jest.fn().mockResolvedValue(ADMIN),
    },
    task: {
      create: jest.fn().mockResolvedValue(makeRow()),
      findFirst: jest.fn(),
    },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
    group: { findFirst: jest.fn() },
    lead: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  emitter = { emit: jest.fn() };
  outbox = { schedule: jest.fn() };
  holidays = { buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()) };
  const mod = await Test.createTestingModule({
    providers: [
      TasksService,
      { provide: PrismaService, useValue: prisma },
      { provide: EventEmitter2, useValue: emitter },
      { provide: HolidaysService, useValue: holidays },
      { provide: TaskOutboxService, useValue: outbox },
    ],
  }).compile();
  service = mod.get(TasksService);
});

describe('TasksService.create', () => {
  const actor = () => ({
    userId: 30,
    companyId: 1,
    roleIds: [3],
    roleNames: ['Administrator'],
    scope: { kind: 'branches' as const, branchIds: [1] },
    headerBranchId: 1,
  });

  it('creates one task with participants, CREATED event, and emits task.assigned', async () => {
    const out = await service.create(
      { title: 'X', assigneeIds: [40] },
      actor(),
    );
    expect(out).toHaveLength(1);
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: 'X',
      authorId: 30,
      branchId: 1,
      priority: 'MEDIUM',
      kind: 'MANUAL',
      batchId: null,
    });
    expect(data.participants.create).toEqual([
      { userId: 40, role: 'ASSIGNEE' },
    ]);
    expect(data.events.create[0]).toMatchObject({
      type: 'CREATED',
      actorId: 30,
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ userIds: [40] }),
    );
  });

  it('commits the batch inside one transaction with a patient budget', async () => {
    await service.create({ title: 'X', assigneeIds: [40] }, actor());
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 15_000,
    });
  });

  it('refuses an assignee outside the ladder, without naming them', async () => {
    prisma.user.findMany.mockResolvedValue([
      { ...BD_OTHER, firstName: 'Zafar', lastName: 'Karimov' },
    ]);
    const err = await service
      .create({ title: 'X', assigneeIds: [20] }, actor())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe(
      'Bu xodimga topshiriq bera olmaysiz',
    );
  });

  it('refuses a watcher outside the caller reach, without naming them', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([TEACHER])
      .mockResolvedValueOnce([BD_OTHER]);
    const err = await service
      .create({ title: 'X', assigneeIds: [40], watcherIds: [20] }, actor())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe(
      'Bu xodimni kuzatuvchi qila olmaysiz',
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('names the watcher list when a watcher id is unknown', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([TEACHER])
      .mockResolvedValueOnce([]);
    await expect(
      service.create(
        { title: 'X', assigneeIds: [40], watcherIds: [99] },
        actor(),
      ),
    ).rejects.toThrow('Kuzatuvchilardan biri topilmadi yoki faol emas');
  });

  it('refuses an unknown or inactive assignee', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await expect(
      service.create({ title: 'X', assigneeIds: [99] }, actor()),
    ).rejects.toThrow(BadRequestException);
  });

  it('a bare day becomes 18:00 Tashkent; a Sunday is refused', async () => {
    await service.create(
      { title: 'X', assigneeIds: [40], dueAt: '2026-10-08' },
      actor(),
    );
    expect(prisma.task.create.mock.calls[0][0].data.dueAt.toISOString()).toBe(
      '2026-10-08T13:00:00.000Z',
    );
    await expect(
      service.create(
        { title: 'X', assigneeIds: [40], dueAt: '2026-10-11' },
        actor(),
      ),
    ).rejects.toThrow(/yakshanba/);
  });

  it('separateCopies creates one task per assignee under one batchId', async () => {
    prisma.user.findMany.mockResolvedValue([TEACHER, { ...TEACHER, id: 41 }]);
    const out = await service.create(
      { title: 'X', assigneeIds: [40, 41], separateCopies: true },
      actor(),
    );
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    const [a, b] = prisma.task.create.mock.calls.map((c: any) => c[0].data);
    expect(typeof a.batchId).toBe('string');
    expect(a.batchId).toBe(b.batchId);
    expect(a.participants.create).toEqual([{ userId: 40, role: 'ASSIGNEE' }]);
    expect(out).toHaveLength(2);
  });

  it('schedules in-app reminder and overdue rows when there is a due date', async () => {
    await service.create(
      { title: 'X', assigneeIds: [40], dueAt: '2026-10-08' },
      actor(),
    );
    expect(outbox.schedule).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ id: 't1' }),
    );
  });

  it('emits task.assigned only after the rows are committed', async () => {
    const order: string[] = [];
    prisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => {
        const out = await cb(prisma);
        order.push('commit');
        return out;
      },
    );
    emitter.emit.mockImplementation(() => order.push('emit'));
    await service.create({ title: 'X', assigneeIds: [40] }, actor());
    expect(order).toEqual(['commit', 'emit']);
  });

  describe('a linked employee', () => {
    const link = { title: 'X', assigneeIds: [40], entityType: 'User' };

    beforeEach(() => {
      prisma.user.findUnique = jest
        .fn()
        .mockResolvedValue({ mainBranch: 1, branches: [] });
    });

    it('must belong to the caller company', async () => {
      // The generic entity guard looks the user up without a company; only
      // the extra check carries `companyId`.
      prisma.user.findFirst.mockImplementation(
        ({ where }: { where: { companyId?: number } }) =>
          Promise.resolve(where.companyId ? null : ADMIN),
      );
      await expect(
        service.create({ ...link, entityId: '41' }, actor()),
      ).rejects.toThrow(/Xodim topilmadi/);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('is accepted when the company matches', async () => {
      await service.create({ ...link, entityId: '41' }, actor());
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 41, companyId: 1 },
        select: { id: true },
      });
      expect(prisma.task.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe('TasksService writes', () => {
  const assigneeActor = () => ({
    userId: 40,
    companyId: 1,
    roleIds: [4],
    roleNames: ['Teacher'],
    scope: { kind: 'branches' as const, branchIds: [1] },
    headerBranchId: 1,
  });
  const authorActor = () => ({
    userId: 30,
    companyId: 1,
    roleIds: [3],
    roleNames: ['Administrator'],
    scope: { kind: 'branches' as const, branchIds: [1] },
    headerBranchId: 1,
  });

  beforeEach(() => {
    prisma.task.findFirst.mockResolvedValue(makeRow());
    prisma.task.update = jest
      .fn()
      .mockImplementation(({ data }: any) =>
        Promise.resolve(makeRow({ ...data })),
      );
    prisma.taskParticipant = {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    };
    prisma.taskStep = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({
        id: 's1',
        taskId: 't1',
        title: 'Old',
        doneAt: null,
      }),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 1 } }),
    };
    prisma.taskEvent = {
      create: jest.fn().mockResolvedValue({
        id: 'e1',
        type: 'COMMENT',
        actorId: 40,
        text: 'hi',
        meta: null,
        via: 'WEB',
        createdAt: new Date(),
        actor: null,
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    prisma.unmarkedLesson = { updateMany: jest.fn() };
    prisma.taskOutbox = { deleteMany: jest.fn() };
  });

  it('assignee moves NEW→IN_PROGRESS, writes a STATUS event, stamps startedAt, emits', async () => {
    await service.changeStatus('t1', 'IN_PROGRESS', assigneeActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      status: 'IN_PROGRESS',
      startedAt: expect.any(Date),
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'STATUS',
      actorId: 40,
      meta: { from: 'NEW', to: 'IN_PROGRESS' },
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.STATUS_CHANGED,
      expect.objectContaining({ from: 'NEW', to: 'IN_PROGRESS' }),
    );
  });

  it('assignee→IN_REVIEW emits review.requested and stamps reviewRequestedAt', async () => {
    await service.changeStatus('t1', 'IN_REVIEW', assigneeActor());
    expect(prisma.task.update.mock.calls[0][0].data.reviewRequestedAt).toEqual(
      expect.any(Date),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.REVIEW_REQUESTED,
      expect.anything(),
    );
  });

  it('an outsider gets 404; an assignee cannot DONE a shared task (400)', async () => {
    await expect(
      service.changeStatus('t1', 'IN_PROGRESS', {
        ...assigneeActor(),
        userId: 99,
      }),
    ).rejects.toThrow('Topshiriq topilmadi');
    await expect(
      service.changeStatus('t1', 'DONE', assigneeActor()),
    ).rejects.toThrow(BadRequestException);
  });

  it('a manager who is not an assignee cannot change status, only review or cancel', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'IN_REVIEW' }));
    await expect(
      service.changeStatus('t1', 'IN_PROGRESS', authorActor()),
    ).rejects.toThrow('Qabul qilish yoki qaytarish tugmasidan foydalaning');
    await expect(
      service.changeStatus('t1', 'DONE', authorActor()),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('an author who is the only assignee closes their own task directly', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({
        participants: [
          {
            userId: 30,
            role: 'ASSIGNEE',
            seenAt: null,
            user: { id: 30, firstName: 'A', lastName: 'B', photo: null },
          },
        ],
      }),
    );
    await service.changeStatus('t1', 'DONE', authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      status: 'DONE',
      closedAt: expect.any(Date),
    });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
  });

  it('emits only after the status change is committed', async () => {
    const order: string[] = [];
    prisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => {
        const out = await cb(prisma);
        order.push('commit');
        return out;
      },
    );
    emitter.emit.mockImplementation(() => order.push('emit'));
    await service.changeStatus('t1', 'IN_PROGRESS', assigneeActor());
    expect(order[0]).toBe('commit');
    expect(order).toContain('emit');
  });

  it('author accepts from IN_REVIEW → DONE with closedAt; returns with a reason → IN_PROGRESS, returnedCount+1', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'IN_REVIEW' }));
    await service.review('t1', 'ACCEPT', undefined, authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      status: 'DONE',
      closedAt: expect.any(Date),
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.REVIEWED,
      expect.objectContaining({ accepted: true }),
    );

    prisma.task.update.mockClear();
    await expect(
      service.review('t1', 'RETURN', '   ', authorActor()),
    ).rejects.toThrow('Qaytarish sababini yozing');
    await service.review('t1', 'RETURN', 'Doska artilmagan', authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      status: 'IN_PROGRESS',
      returnedCount: { increment: 1 },
    });
    expect(prisma.taskEvent.create.mock.calls.at(-1)[0].data).toMatchObject({
      type: 'RETURN',
      text: 'Doska artilmagan',
    });
  });

  it('assignee cannot review (403)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'IN_REVIEW' }));
    await expect(
      service.review('t1', 'ACCEPT', undefined, assigneeActor()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cancel by author: CANCELLED, outbox rows dropped, event emitted', async () => {
    await service.cancel('t1', 'kerak emas', authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'kerak emas',
    });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.CANCELLED,
      expect.anything(),
    );
  });

  it('a system task refuses manual close and update', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({ kind: 'LESSON_QUESTION', authorId: null, status: 'NEW' }),
    );
    await expect(
      service.cancel('t1', undefined, {
        ...authorActor(),
        roleIds: [1],
        scope: { kind: 'all' },
      }),
    ).rejects.toThrow("tizim o'zi yopadi");
    await expect(
      service.update(
        't1',
        { title: 'x' },
        { ...authorActor(), roleIds: [1], scope: { kind: 'all' } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('system task: first assignee to act claims it (others removed, claimedById set)', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({
        kind: 'LESSON_QUESTION',
        authorId: null,
        participants: [
          {
            userId: 40,
            role: 'ASSIGNEE',
            seenAt: null,
            user: { id: 40, firstName: 'T', lastName: 'U', photo: null },
          },
          {
            userId: 41,
            role: 'ASSIGNEE',
            seenAt: null,
            user: { id: 41, firstName: 'V', lastName: 'W', photo: null },
          },
        ],
      }),
    );
    prisma.taskParticipant.findMany.mockResolvedValue([
      { userId: 40 },
      { userId: 41 },
    ]);
    await service.changeStatus('t1', 'IN_PROGRESS', assigneeActor());
    expect(prisma.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { claimedById: 40 },
    });
    expect(prisma.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 40 } },
    });
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      claimedById: 40,
    });
    // Lock order: the lesson row first, then the task.
    expect(
      prisma.unmarkedLesson.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.task.update.mock.invocationCallOrder[0]);
  });

  it('claimSystemTask refuses someone who is not an assignee and changes nothing', async () => {
    prisma.taskParticipant.findMany.mockResolvedValue([{ userId: 41 }]);
    await expect(claimSystemTask(prisma, 't1', 40)).resolves.toBe(false);
    expect(prisma.unmarkedLesson.updateMany).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('setParticipants emits assigned for added and unassigned for removed', async () => {
    prisma.user.findMany.mockResolvedValue([{ ...TEACHER, id: 41 }]);
    await service.setParticipants('t1', [41], [], authorActor());
    expect(prisma.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: { in: [40] } },
    });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: { in: [40] }, sentAt: null },
    });
    expect(prisma.taskParticipant.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 't1', userId: 41, role: 'ASSIGNEE' }],
      skipDuplicates: true,
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ userIds: [41] }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.UNASSIGNED,
      expect.objectContaining({ userIds: [40] }),
    );
  });

  it('setParticipants refuses an assignee outside the ladder without naming them', async () => {
    prisma.user.findMany.mockResolvedValue([
      { ...BD_OTHER, firstName: 'Zafar', lastName: 'Karimov' },
    ]);
    const err = await service
      .setParticipants('t1', [20], [], authorActor())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).message).toBe(
      'Bu xodimga topshiriq bera olmaysiz',
    );
    expect(prisma.taskParticipant.createMany).not.toHaveBeenCalled();
  });

  it('setParticipants: only the author changes them, and never with an empty assignee list', async () => {
    prisma.user.findMany.mockResolvedValue([TEACHER]);
    await expect(
      service.setParticipants('t1', [40], [], assigneeActor()),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.setParticipants('t1', [], [], authorActor()),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.taskParticipant.deleteMany).not.toHaveBeenCalled();
  });

  it('setParticipants flips roles in place and changes nothing when nothing differs', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({
        participants: [
          {
            userId: 40,
            role: 'ASSIGNEE',
            seenAt: null,
            user: { id: 40, firstName: 'T', lastName: 'U', photo: null },
          },
          {
            userId: 41,
            role: 'WATCHER',
            seenAt: null,
            user: { id: 41, firstName: 'V', lastName: 'W', photo: null },
          },
        ],
      }),
    );
    // 41 becomes the assignee, 40 only watches.
    prisma.user.findMany
      .mockResolvedValueOnce([{ ...TEACHER, id: 41 }])
      .mockResolvedValueOnce([TEACHER]);
    await service.setParticipants('t1', [41], [40], authorActor());
    expect(prisma.taskParticipant.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: { in: [41] } },
      data: { role: 'ASSIGNEE' },
    });
    expect(prisma.taskParticipant.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: { in: [40] } },
      data: { role: 'WATCHER' },
    });
    expect(prisma.taskParticipant.deleteMany).not.toHaveBeenCalled();
    expect(prisma.taskParticipant.createMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalledWith(
      TASK_EVENTS.UNASSIGNED,
      expect.anything(),
    );

    // The same lists again: no write, no event, no notification.
    prisma.taskParticipant.updateMany.mockClear();
    prisma.taskEvent.create.mockClear();
    emitter.emit.mockClear();
    prisma.user.findMany
      .mockResolvedValueOnce([{ ...TEACHER, id: 40 }])
      .mockResolvedValueOnce([{ ...TEACHER, id: 41 }]);
    await service.setParticipants('t1', [40], [41], authorActor());
    expect(prisma.taskParticipant.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('setParticipants answers an outsider 404 before it looks any person up', async () => {
    await expect(
      service.setParticipants('t1', [40], [], {
        ...assigneeActor(),
        userId: 99,
      }),
    ).rejects.toThrow('Topshiriq topilmadi');
    await expect(
      service.setParticipants('t1', [40], [], assigneeActor()),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('markSeen stamps seenAt once', async () => {
    await service.markSeen('t1', assigneeActor());
    expect(prisma.taskParticipant.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', userId: 40, seenAt: null },
      data: { seenAt: expect.any(Date) },
    });
  });

  it('steps: assignee adds and ticks; only a manager deletes', async () => {
    await service.addStep('t1', 'Doskani artish', assigneeActor());
    expect(prisma.taskStep.create.mock.calls[0][0].data).toMatchObject({
      taskId: 't1',
      title: 'Doskani artish',
      position: 2,
    });
    await service.updateStep('t1', 's1', { done: true }, assigneeActor());
    expect(prisma.taskStep.update.mock.calls[0][0].data).toMatchObject({
      doneAt: expect.any(Date),
      doneById: 40,
    });
    await expect(
      service.updateStep('t1', 's1', { title: 'x' }, assigneeActor()),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.deleteStep('t1', 's1', assigneeActor()),
    ).rejects.toThrow(ForbiddenException);
    await service.deleteStep('t1', 's1', authorActor());
    expect(prisma.taskStep.deleteMany).toHaveBeenCalledWith({
      where: { id: 's1', taskId: 't1' },
    });
    expect(prisma.taskEvent.create.mock.calls.at(-1)[0].data).toMatchObject({
      type: 'STEP',
      actorId: 30,
      meta: { action: 'deleted', title: 'Old' },
    });
  });

  it('a rename is logged with the old and the new title; a repeat tick is a no-op', async () => {
    await service.updateStep('t1', 's1', { title: 'New' }, authorActor());
    expect(prisma.taskStep.update.mock.calls[0][0].data).toEqual({
      title: 'New',
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'STEP',
      meta: { action: 'renamed', from: 'Old', to: 'New' },
    });

    prisma.taskStep.update.mockClear();
    prisma.taskEvent.create.mockClear();
    // Same title again, and "done" on a step that is already done.
    prisma.taskStep.findFirst.mockResolvedValue({
      id: 's1',
      taskId: 't1',
      title: 'Old',
      doneAt: new Date(),
    });
    await service.updateStep(
      't1',
      's1',
      { title: 'Old', done: true },
      authorActor(),
    );
    expect(prisma.taskStep.update).not.toHaveBeenCalled();
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
    // Un-ticking a done step is a real change.
    await service.updateStep('t1', 's1', { done: false }, authorActor());
    expect(prisma.taskStep.update.mock.calls[0][0].data).toEqual({
      doneAt: null,
      doneById: null,
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({
      meta: { action: 'undone', title: 'Old' },
    });
  });

  it('steps are refused on a system task and on a closed one', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({ kind: 'LESSON_QUESTION', authorId: null }),
    );
    await expect(service.addStep('t1', 'A', assigneeActor())).rejects.toThrow(
      "Tizim topshirig'ida qadam yo'q",
    );

    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'DONE' }));
    await expect(service.addStep('t1', 'A', assigneeActor())).rejects.toThrow(
      "Yopilgan topshiriq o'zgartirilmaydi",
    );
    await expect(
      service.updateStep('t1', 's1', { done: true }, assigneeActor()),
    ).rejects.toThrow(BadRequestException);
    await expect(service.deleteStep('t1', 's1', authorActor())).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.taskStep.create).not.toHaveBeenCalled();
    expect(prisma.taskStep.update).not.toHaveBeenCalled();
    expect(prisma.taskStep.deleteMany).not.toHaveBeenCalled();
  });

  it('a step of another task is not found, and is never touched', async () => {
    prisma.taskStep.findFirst.mockResolvedValue(null);
    await expect(
      service.deleteStep('t1', 'foreign', authorActor()),
    ).rejects.toThrow('Qadam topilmadi');
    await expect(
      service.updateStep('t1', 'foreign', { done: true }, assigneeActor()),
    ).rejects.toThrow('Qadam topilmadi');
    expect(prisma.taskStep.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', taskId: 't1' },
    });
    expect(prisma.taskStep.deleteMany).not.toHaveBeenCalled();
    expect(prisma.taskStep.update).not.toHaveBeenCalled();
  });

  it('a step that vanished between the lookup and the delete is not found', async () => {
    prisma.taskStep.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteStep('t1', 's1', authorActor())).rejects.toThrow(
      'Qadam topilmadi',
    );
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('addComment writes COMMENT and emits commented', async () => {
    await service.addComment('t1', 'hi', assigneeActor());
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'COMMENT',
      text: 'hi',
      actorId: 40,
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.COMMENTED,
      expect.objectContaining({ text: 'hi' }),
    );
  });

  it('addComment refuses a blank text', async () => {
    await expect(
      service.addComment('t1', '   ', assigneeActor()),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('update by author changes title/due; due change reschedules outbox and emits due.changed', async () => {
    await service.update(
      't1',
      { title: 'Y', dueAt: '2026-10-08' },
      authorActor(),
    );
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({
      title: 'Y',
      dueAt: new Date('2026-10-08T13:00:00.000Z'),
    });
    // The outbox's own `schedule` clears the old rows; no second delete here.
    expect(prisma.taskOutbox.deleteMany).not.toHaveBeenCalled();
    expect(outbox.schedule).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ id: 't1' }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.DUE_CHANGED,
      expect.anything(),
    );
  });

  it('clearing the due date still hands the task to schedule so its rows are cleared', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({ dueAt: new Date('2026-10-08T13:00:00.000Z') }),
    );
    await service.update('t1', { dueAt: null }, authorActor());
    expect(outbox.schedule).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ id: 't1', dueAt: null }),
    );
  });

  it('update refuses a closed task', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'DONE' }));
    await expect(
      service.update('t1', { title: 'Y' }, authorActor()),
    ).rejects.toThrow("Yopilgan topshiriq o'zgartirilmaydi");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('update looks the holidays up before the transaction opens', async () => {
    await service.update('t1', { dueAt: '2026-10-08' }, authorActor());
    expect(
      holidays.buildHolidayDateSet.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
  });

  it('duplicate copies title, priority, participants, steps as NEW by the actor', async () => {
    prisma.task.findFirst.mockResolvedValue(
      makeRow({
        steps: [
          {
            id: 's1',
            title: 'A',
            position: 0,
            doneAt: new Date(),
            doneById: 40,
          },
        ],
      }),
    );
    await service.duplicate('t1', authorActor());
    const data = prisma.task.create.mock.calls.at(-1)[0].data;
    // `status` is not written: the column defaults to NEW.
    expect(data.status).toBeUndefined();
    expect(data).toMatchObject({
      title: 'X',
      authorId: 30,
      priority: 'MEDIUM',
      dueAt: null,
    });
    expect(data.steps.create).toEqual([{ title: 'A', position: 0 }]);
    expect(data.participants.create).toEqual([
      { userId: 40, role: 'ASSIGNEE' },
    ]);
  });
});

describe('parseDueInput', () => {
  it('turns a bare day into 18:00 Tashkent', () => {
    expect(parseDueInput('2026-10-08')?.toISOString()).toBe(
      '2026-10-08T13:00:00.000Z',
    );
  });

  it('keeps an ISO instant as it is', () => {
    expect(parseDueInput('2026-10-08T09:30:00+05:00')?.toISOString()).toBe(
      '2026-10-08T04:30:00.000Z',
    );
    expect(parseDueInput('2026-10-08T09:30:00.000Z')?.toISOString()).toBe(
      '2026-10-08T09:30:00.000Z',
    );
    expect(parseDueInput('2026-10-08T09:30:00-05:00')?.toISOString()).toBe(
      '2026-10-08T14:30:00.000Z',
    );
  });

  it('reads nothing as no due date', () => {
    expect(parseDueInput(undefined)).toBeNull();
    expect(parseDueInput(null)).toBeNull();
    expect(parseDueInput('')).toBeNull();
  });

  it.each([
    'tomorrow',
    '2026-02-30',
    '2026-13-45',
    '2026-10-08 10:00',
    '10/08/2026',
    'Oct 8, 2026',
    '2026-10-08T25:00:00Z',
    // An instant without a zone would be read in the PROCESS timezone.
    '2026-10-08T09:30:00',
    '2026-10-08T09:30',
    '2026-10-08T09:30:00.000',
  ])('refuses %s', (raw) => {
    expect(() => parseDueInput(raw)).toThrow(BadRequestException);
  });

  it('refuses a value that is not a string', () => {
    expect(() => parseDueInput(1760000000000)).toThrow(BadRequestException);
    expect(() => parseDueInput({})).toThrow(BadRequestException);
  });
});

import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService, parseDueInput } from './tasks.service';
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

describe('TasksService.create', () => {
  let service: TasksService;
  let prisma: any;
  let emitter: { emit: jest.Mock };
  let outbox: { schedule: jest.Mock };

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
    const mod = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
        {
          provide: HolidaysService,
          useValue: {
            buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
          },
        },
        { provide: TaskOutboxService, useValue: outbox },
      ],
    }).compile();
    service = mod.get(TasksService);
  });

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

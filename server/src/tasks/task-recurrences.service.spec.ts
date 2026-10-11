jest.mock('./task-recurrence-rules', () => ({
  ...jest.requireActual('./task-recurrence-rules'),
  recurrenceHolidays: jest.fn().mockResolvedValue(new Set<string>()),
}));
jest.mock('./task-create', () => ({
  ...jest.requireActual('./task-create'),
  createCopiesTx: jest.fn(),
}));

jest.mock('./task-people', () => ({
  ...jest.requireActual('./task-people'),
  loadAndCheckPeople: jest.fn(),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createCopiesTx } from './task-create';
import { loadAndCheckPeople } from './task-people';
import { TASK_EVENTS } from './task-events';
import { TaskRecurrencesService } from './task-recurrences.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
// Monday 12.10.2026, 09:00 Tashkent.
const MON_0900 = new Date('2026-10-12T04:00:00Z');
const actor = {
  userId: 10,
  companyId: 1,
  roleIds: [3],
  roleNames: ['Administrator'],
  scope: { kind: 'branches' as const, branchIds: [7] },
  headerBranchId: 7,
};
const row = (ids: number[]) => ({
  id: 't1',
  companyId: 1,
  title: 'Kassani tekshirish',
  kind: 'MANUAL',
  authorId: 10,
  dueAt: null,
  status: 'NEW',
  participants: ids.map((userId) => ({ userId, role: 'ASSIGNEE' })),
  author: null,
  _count: { steps: 0, events: 1 },
  steps: [],
  unmarkedLesson: null,
});

function setup(
  prepared = {
    branchId: 7,
    assigneeIds: [20],
    watcherIds: [30],
    groups: [[20]],
  },
  activeCount = prepared.assigneeIds.length,
) {
  const tx = {
    taskRecurrence: {
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    user: {
      count: jest.fn().mockResolvedValue(activeCount),
      findMany: jest.fn().mockResolvedValue([]),
    },
    taskRecurrence: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const emitter = { emit: jest.fn() };
  const tasks = {
    prepareCreate: jest.fn().mockResolvedValue(prepared),
    actorPerson: jest.fn(
      (a: {
        userId: number;
        roleIds: number[];
        scope: { kind: string; branchIds?: number[] };
      }) => ({
        id: a.userId,
        roleIds: a.roleIds,
        branchIds: a.scope.kind === 'all' ? 'all' : a.scope.branchIds,
      }),
    ),
    // The rule's author, read the way the 07:00 run reads them.
    loadActor: jest.fn().mockResolvedValue({
      userId: 99,
      companyId: 1,
      roleIds: [3],
      scope: { kind: 'branches', branchIds: [7] },
    }),
  };
  (createCopiesTx as jest.Mock).mockImplementation(
    (_tx: unknown, _t: unknown, groups: number[][]) =>
      Promise.resolve(groups.map((ids) => ({ ids, row: row(ids) }))),
  );
  const svc = new TaskRecurrencesService(
    prisma as never,
    emitter as never,
    tasks as never,
  );
  return { svc, tx, prisma, emitter, tasks };
}

describe('TaskRecurrencesService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the rule and makes its first task in one transaction', async () => {
    const { svc, tx, emitter } = setup();
    const dto = {
      title: ' Kassani tekshirish ',
      assigneeIds: [20],
      watcherIds: [30],
      steps: [{ title: 'Sanash' }],
      recurrence: { freq: 'DAILY' as const, dueTime: '10:00' },
    };
    await svc.create(dto, actor as never, MON_0900);

    expect(tx.taskRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        branchId: 7,
        authorId: 10,
        freq: 'DAILY',
        weekdays: [],
        dayOfMonth: null,
        dueTime: '10:00',
        title: 'Kassani tekshirish',
        assigneeIds: [20],
        watcherIds: [30],
        steps: ['Sanash'],
        separateCopies: false,
        // Today's 10:00 is still ahead: today is the first run, tomorrow the next.
        nextRunDate: day('2026-10-13'),
      }),
      select: { id: true },
    });
    expect(createCopiesTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recurrenceId: 'r1',
        authorId: 10,
        branchId: 7,
        dueAt: new Date('2026-10-12T05:00:00.000Z'),
        batchId: null,
        watcherIds: [30],
      }),
      [[20]],
      expect.any(Function),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ actorId: 10, userIds: [20], created: true }),
    );
  });

  it('a time already past today starts tomorrow', async () => {
    const { svc, tx } = setup();
    const createCalls = createCopiesTx as jest.Mock;
    await svc.create(
      {
        title: 'X',
        assigneeIds: [20],
        recurrence: { freq: 'DAILY', dueTime: '08:00' },
      },
      actor as never,
      MON_0900,
    );
    expect(tx.taskRecurrence.create.mock.calls[0][0].data.nextRunDate).toEqual(
      day('2026-10-14'),
    );
    expect(createCalls.mock.calls[0][1].dueAt).toEqual(
      new Date('2026-10-13T03:00:00.000Z'),
    );
  });

  it('refuses a due date next to a recurrence', async () => {
    const { svc, tasks } = setup();
    await expect(
      svc.create(
        {
          title: 'X',
          assigneeIds: [20],
          dueAt: '2026-10-13',
          recurrence: { freq: 'DAILY' },
        },
        actor as never,
        MON_0900,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tasks.prepareCreate).not.toHaveBeenCalled();
  });

  it('refuses a bad schedule before any check or write', async () => {
    const { svc, tasks, prisma } = setup();
    await expect(
      svc.create(
        {
          title: 'X',
          assigneeIds: [20],
          recurrence: { freq: 'WEEKLY', weekdays: [] },
        },
        actor as never,
        MON_0900,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tasks.prepareCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an assignee who is not active staff: nothing is written', async () => {
    const { svc, prisma } = setup(undefined, 0);
    await expect(
      svc.create(
        { title: 'X', assigneeIds: [20], recurrence: { freq: 'DAILY' } },
        actor as never,
        MON_0900,
      ),
    ).rejects.toThrow('Takrorlanuvchi topshiriq faqat faol xodimga beriladi');
    // The same live-active test the 07:00 run applies.
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: { in: [20] },
        companyId: 1,
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('separate copies: one task per assignee with one batch id, and the rule remembers it', async () => {
    const { svc, tx } = setup({
      branchId: 7,
      assigneeIds: [20, 21],
      watcherIds: [],
      groups: [[20], [21]],
    });
    await svc.create(
      {
        title: 'X',
        assigneeIds: [20, 21],
        separateCopies: true,
        recurrence: { freq: 'DAILY' },
      },
      actor as never,
      MON_0900,
    );
    expect(tx.taskRecurrence.create.mock.calls[0][0].data.separateCopies).toBe(
      true,
    );
    const t = (createCopiesTx as jest.Mock).mock.calls[0][1];
    expect(typeof t.batchId).toBe('string');
  });
});

const stored = {
  id: 'r1',
  companyId: 1,
  branchId: 7,
  authorId: 10,
  freq: 'DAILY',
  weekdays: [],
  dayOfMonth: null,
  dueTime: '10:00',
  title: 'X',
  assigneeIds: [20],
  watcherIds: [30],
  separateCopies: false,
  active: true,
  nextRunDate: day('2026-10-13'),
  author: { id: 10, firstName: 'A', lastName: 'B', photo: null },
};

describe('TaskRecurrencesService.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('CEO: the whole company', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findMany.mockResolvedValue([]);
    await svc.list({ ...actor, roleIds: [1], scope: { kind: 'all' } } as never);
    expect(prisma.taskRecurrence.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1,
    });
  });
  it("Branch Director: own rules and the branches' rules", async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findMany.mockResolvedValue([]);
    await svc.list({ ...actor, roleIds: [2] } as never);
    expect(prisma.taskRecurrence.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1,
      OR: [{ authorId: 10 }, { branchId: { in: [7] } }],
    });
  });
  it('anyone else: own rules', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findMany.mockResolvedValue([]);
    await svc.list(actor as never);
    expect(prisma.taskRecurrence.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1,
      authorId: 10,
    });
  });
});

describe('TaskRecurrencesService.update / remove', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadAndCheckPeople as jest.Mock).mockReset();
  });

  it('404 for a rule the caller may not manage (and for an unknown id)', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue({
      ...stored,
      authorId: 99,
    });
    await expect(
      svc.update('r1', { active: false }, actor as never),
    ).rejects.toThrow(NotFoundException);
    prisma.taskRecurrence.findFirst.mockResolvedValue(null);
    await expect(svc.remove('r1', actor as never)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.taskRecurrence.update).not.toHaveBeenCalled();
    expect(prisma.taskRecurrence.delete).not.toHaveBeenCalled();
  });
  it('stop: only the flag', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    await svc.update('r1', { active: false }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { active: false },
    });
  });
  it('a new schedule on a resume starts from tomorrow', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    await svc.update(
      'r1',
      {
        active: true,
        schedule: { freq: 'WEEKLY', weekdays: [3], dueTime: '09:00' },
      },
      actor as never,
      MON_0900,
    );
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        active: true,
        freq: 'WEEKLY',
        weekdays: [3],
        dayOfMonth: null,
        dueTime: '09:00',
        nextRunDate: day('2026-10-14'),
      },
    });
  });
  it('resuming a stopped rule starts from tomorrow; "active" on a running rule moves nothing', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue({
      ...stored,
      active: false,
    });
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    await svc.update('r1', { active: true }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenLastCalledWith({
      where: { id: 'r1' },
      data: { active: true, nextRunDate: day('2026-10-13') },
    });
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    await svc.update('r1', { active: true }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenLastCalledWith({
      where: { id: 'r1' },
      data: { active: true },
    });
  });
  it('delete removes the rule row only', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    await expect(svc.remove('r1', actor as never)).resolves.toEqual({
      ok: true,
    });
    expect(prisma.taskRecurrence.delete).toHaveBeenCalledWith({
      where: { id: 'r1' },
    });
  });

  it('new assignees: the author edits, the checked ids are written, the date stays', async () => {
    const { svc, prisma, tasks } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    (loadAndCheckPeople as jest.Mock).mockResolvedValueOnce({
      assignees: [{ id: 21 }],
      watchers: [],
    });
    await svc.update('r1', { assigneeIds: [21] }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { assigneeIds: [21], watcherIds: [30] },
    });
    // The caller is the author: one check, no second actor to load.
    expect(loadAndCheckPeople).toHaveBeenCalledTimes(1);
    expect(tasks.loadActor).not.toHaveBeenCalled();
  });
  it('a new assignee who is also a watcher leaves the watchers', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    (loadAndCheckPeople as jest.Mock).mockResolvedValueOnce({
      assignees: [{ id: 30 }],
      watchers: [],
    });
    await svc.update('r1', { assigneeIds: [30] }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { assigneeIds: [30], watcherIds: [] },
    });
  });
  it('the caller may not reach the assignee: 403, nothing written', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    (loadAndCheckPeople as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException('x'),
    );
    await expect(
      svc.update('r1', { assigneeIds: [21] }, actor as never, MON_0900),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.taskRecurrence.update).not.toHaveBeenCalled();
  });
  it("a manager edits another author's rule: the author's reach is checked too", async () => {
    const { svc, prisma, tasks } = setup();
    // A Branch Director of branch 7 manages a rule written by user 99.
    const bd = { ...actor, roleIds: [2] };
    prisma.taskRecurrence.findFirst.mockResolvedValue({
      ...stored,
      authorId: 99,
    });
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    (loadAndCheckPeople as jest.Mock)
      .mockResolvedValueOnce({ assignees: [{ id: 21 }], watchers: [] })
      .mockResolvedValueOnce({ assignees: [{ id: 21 }], watchers: [] });
    await svc.update('r1', { assigneeIds: [21] }, bd as never, MON_0900);
    expect(tasks.loadActor).toHaveBeenCalledWith(99, 1, null);
    const calls = (loadAndCheckPeople as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ id: 10, roleIds: [2] });
    expect(calls[1][1]).toMatchObject({ id: 99, roleIds: [3] });
    expect(prisma.taskRecurrence.update).toHaveBeenCalledTimes(1);
  });
  it('an assignee the author cannot reach: 403, nothing written', async () => {
    const { svc, prisma } = setup();
    const bd = { ...actor, roleIds: [2] };
    prisma.taskRecurrence.findFirst.mockResolvedValue({
      ...stored,
      authorId: 99,
    });
    (loadAndCheckPeople as jest.Mock)
      .mockResolvedValueOnce({ assignees: [{ id: 21 }], watchers: [] })
      .mockRejectedValueOnce(new ForbiddenException('x'));
    await expect(
      svc.update('r1', { assigneeIds: [21] }, bd as never, MON_0900),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.taskRecurrence.update).not.toHaveBeenCalled();
  });
  it('an assignee who is not active staff: 400, nothing written', async () => {
    const { svc, prisma } = setup(undefined, 0);
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    (loadAndCheckPeople as jest.Mock).mockResolvedValueOnce({
      assignees: [{ id: 21 }],
      watchers: [],
    });
    await expect(
      svc.update('r1', { assigneeIds: [21] }, actor as never, MON_0900),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.taskRecurrence.update).not.toHaveBeenCalled();
  });
});

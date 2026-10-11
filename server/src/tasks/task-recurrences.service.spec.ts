jest.mock('./task-recurrence-rules', () => ({
  ...jest.requireActual('./task-recurrence-rules'),
  recurrenceHolidays: jest.fn().mockResolvedValue(new Set<string>()),
}));
jest.mock('./task-create', () => ({
  ...jest.requireActual('./task-create'),
  createCopiesTx: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { createCopiesTx } from './task-create';
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
    user: { count: jest.fn().mockResolvedValue(activeCount) },
  };
  const emitter = { emit: jest.fn() };
  const tasks = { prepareCreate: jest.fn().mockResolvedValue(prepared) };
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

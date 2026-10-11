jest.mock('./task-create', () => ({
  ...jest.requireActual('./task-create'),
  assertMayLinkEntity: jest.fn(async () => undefined),
  createCopiesTx: jest.fn(),
}));
jest.mock('./task-people', () => ({
  ...jest.requireActual('./task-people'),
  reachablePeople: jest.fn(),
}));
jest.mock('./task-recurrence-rules', () => ({
  ...jest.requireActual('./task-recurrence-rules'),
  recurrenceHolidays: jest.fn(async () => new Set<string>()),
}));

import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { assertMayLinkEntity, createCopiesTx } from './task-create';
import { TASK_EVENTS } from './task-events';
import { reachablePeople } from './task-people';
import { TaskRecurrenceRunner } from './task-recurrence-run.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MON_0700 = new Date('2026-10-12T02:00:00Z');
const SUN_0700 = new Date('2026-10-11T02:00:00Z');
const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  companyId: 1,
  branchId: 7,
  authorId: 10,
  freq: 'DAILY',
  weekdays: [],
  dayOfMonth: null,
  dueTime: '10:00',
  title: 'Kassani tekshirish',
  description: null,
  priority: 'MEDIUM',
  assigneeIds: [20, 21],
  watcherIds: [30],
  steps: ['Sanash'],
  entityType: null,
  entityId: null,
  separateCopies: false,
  nextRunDate: day('2026-10-12'),
  ...over,
});

function setup(
  o: { rules?: unknown[]; claim?: number; open?: number[][] } = {},
) {
  const tx = {
    taskRecurrence: {
      updateMany: jest.fn().mockResolvedValue({ count: o.claim ?? 1 }),
    },
    task: {
      findMany: jest.fn().mockResolvedValue(
        (o.open ?? []).map((ids) => ({
          participants: ids.map((userId) => ({ userId })),
        })),
      ),
    },
  };
  const prisma = {
    taskRecurrence: {
      findMany: jest.fn().mockResolvedValue(o.rules ?? [rule()]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { count: jest.fn().mockResolvedValue(1) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const emitter = { emit: jest.fn() };
  const tasks = {
    loadActor: jest.fn().mockResolvedValue({
      userId: 10,
      companyId: 1,
      roleIds: [1],
      roleNames: ['CEO'],
      scope: { kind: 'all' },
      headerBranchId: null,
    }),
    actorPerson: jest.fn(() => ({ id: 10, roleIds: [1], branchIds: 'all' })),
  };
  (reachablePeople as jest.Mock).mockResolvedValue({
    assigneeIds: [20, 21],
    watcherIds: [30],
  });
  (createCopiesTx as jest.Mock).mockImplementation(
    (_tx: unknown, _t: unknown, groups: number[][]) =>
      Promise.resolve(
        groups.map((ids, i) => ({
          ids,
          row: {
            id: `t${i}`,
            companyId: 1,
            title: 'Kassani tekshirish',
            kind: 'MANUAL',
            authorId: 10,
            dueAt: null,
            status: 'NEW',
            participants: ids.map((userId) => ({ userId, role: 'ASSIGNEE' })),
          },
        })),
      ),
  );
  const runner = new TaskRecurrenceRunner(
    prisma as never,
    emitter as never,
    tasks as never,
  );
  return { runner, prisma, tx, emitter, tasks };
}

describe('TaskRecurrenceRunner.run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks for active rules due today or earlier', async () => {
    const { runner, prisma } = setup({ rules: [] });
    await runner.run(MON_0700);
    expect(prisma.taskRecurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, nextRunDate: { lte: day('2026-10-12') } },
      }),
    );
  });

  it("makes today's task through the create writer and moves the date in the same transaction", async () => {
    const { runner, tx, emitter } = setup();
    const out = await runner.run(MON_0700);
    expect(out.created).toBe(1);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-12') },
      data: { nextRunDate: day('2026-10-13') },
    });
    expect(createCopiesTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        companyId: 1,
        branchId: 7,
        authorId: 10,
        recurrenceId: 'r1',
        via: 'SYSTEM',
        dueAt: new Date('2026-10-12T05:00:00.000Z'),
        batchId: null,
        watcherIds: [30],
        dto: expect.objectContaining({
          title: 'Kassani tekshirish',
          steps: [{ title: 'Sanash' }],
        }),
      }),
      [[20, 21]],
      expect.any(Function),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({
        actorId: 10,
        userIds: [20, 21],
        created: true,
      }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ userIds: [30] }),
    );
  });

  it('the events wait for the commit: a rolled-back transaction emits nothing', async () => {
    const { runner, prisma, emitter } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error('insert failed'));
    const out = await runner.run(MON_0700);
    expect(out.created).toBe(0);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('a second instance that lost the claim makes nothing', async () => {
    const { runner, emitter } = setup({ claim: 0 });
    const out = await runner.run(MON_0700);
    expect(out.taken).toBe(1);
    expect(createCopiesTx).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('an open task of the rule: no new one, the date still moves', async () => {
    const { runner, tx } = setup({ open: [[20]] });
    const out = await runner.run(MON_0700);
    expect(out.open).toBe(1);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalled();
    expect(createCopiesTx).not.toHaveBeenCalled();
  });

  it('a joint rule with one assignee left is still joint: the open task blocks it', async () => {
    const { runner } = setup({ open: [[20, 21]] });
    (reachablePeople as jest.Mock).mockResolvedValue({
      assigneeIds: [21],
      watcherIds: [],
    });
    const out = await runner.run(MON_0700);
    expect(out.open).toBe(1);
    expect(createCopiesTx).not.toHaveBeenCalled();
  });

  it('separate copies: only whoever has no open copy gets one', async () => {
    const { runner } = setup({
      rules: [rule({ separateCopies: true })],
      open: [[20]],
    });
    await runner.run(MON_0700);
    expect((createCopiesTx as jest.Mock).mock.calls[0][2]).toEqual([[21]]);
  });

  it('separate copies with one assignee left still makes a copy for them', async () => {
    const { runner } = setup({
      rules: [rule({ separateCopies: true })],
    });
    (reachablePeople as jest.Mock).mockResolvedValue({
      assigneeIds: [21],
      watcherIds: [],
    });
    await runner.run(MON_0700);
    expect((createCopiesTx as jest.Mock).mock.calls[0][2]).toEqual([[21]]);
  });

  it('nobody left to give it to: the run is skipped, the date moves', async () => {
    const { runner, tx } = setup();
    (reachablePeople as jest.Mock).mockResolvedValue({
      assigneeIds: [],
      watcherIds: [],
    });
    const out = await runner.run(MON_0700);
    expect(out['no-assignee']).toBe(1);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalled();
    expect(createCopiesTx).not.toHaveBeenCalled();
  });

  it('the author is gone: the rule stops itself', async () => {
    const { runner, prisma, tasks } = setup();
    tasks.loadActor.mockRejectedValueOnce(new ForbiddenException('x'));
    const out = await runner.run(MON_0700);
    expect(out.stopped).toBe(1);
    expect(prisma.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-12') },
      data: { active: false },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a deactivated author (INACTIVE / isActive false) stops the rule, no task', async () => {
    const { runner, prisma, tasks } = setup();
    prisma.user.count.mockResolvedValueOnce(0);
    const out = await runner.run(MON_0700);
    expect(out.stopped).toBe(1);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: 10,
        companyId: 1,
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
      },
    });
    expect(tasks.loadActor).not.toHaveBeenCalled();
    expect(prisma.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-12') },
      data: { active: false },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(createCopiesTx).not.toHaveBeenCalled();
  });

  it('the author is gone but another instance already moved the rule: taken', async () => {
    const { runner, prisma, tasks } = setup();
    tasks.loadActor.mockRejectedValueOnce(new ForbiddenException('x'));
    prisma.taskRecurrence.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await runner.run(MON_0700)).taken).toBe(1);
  });

  it('the linked record is gone: the rule stops itself', async () => {
    const { runner } = setup({
      rules: [rule({ entityType: 'Student', entityId: '5' })],
    });
    (assertMayLinkEntity as jest.Mock).mockRejectedValueOnce(
      new NotFoundException('x'),
    );
    expect((await runner.run(MON_0700)).stopped).toBe(1);
  });

  it('the linked record no longer passes the check (400): the rule stops itself', async () => {
    const { runner } = setup({
      rules: [rule({ entityType: 'Student', entityId: '5' })],
    });
    (assertMayLinkEntity as jest.Mock).mockRejectedValueOnce(
      new BadRequestException('x'),
    );
    expect((await runner.run(MON_0700)).stopped).toBe(1);
  });

  it('a Sunday morning leaves the rule for Monday', async () => {
    const { runner, prisma } = setup({
      rules: [rule({ nextRunDate: day('2026-10-10') })],
    });
    const out = await runner.run(SUN_0700);
    expect(out.off).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a missed morning is made up once, due today, and the next run is after today', async () => {
    const { runner, tx } = setup({
      rules: [rule({ nextRunDate: day('2026-10-10') })],
    });
    await runner.run(MON_0700);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-10') },
      data: { nextRunDate: day('2026-10-13') },
    });
    expect((createCopiesTx as jest.Mock).mock.calls[0][1].dueAt).toEqual(
      new Date('2026-10-12T05:00:00.000Z'),
    );
  });

  it('one failing rule does not stop the next', async () => {
    const { runner, tasks } = setup({
      rules: [rule({ id: 'bad' }), rule({ id: 'good' })],
    });
    tasks.loadActor.mockRejectedValueOnce(new Error('db down'));
    const out = await runner.run(MON_0700);
    expect(out.created).toBe(1);
  });
});

describe('TaskRecurrenceRunner.tick', () => {
  it('a tick that finds the run still going does nothing', async () => {
    const { runner } = setup();
    let release: () => void = () => undefined;
    const spy = jest.spyOn(runner, 'run').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({} as never);
        }),
    );
    const first = runner.tick();
    await runner.tick();
    expect(spy).toHaveBeenCalledTimes(1);
    release();
    await first;
    const third = runner.tick();
    release();
    await third;
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

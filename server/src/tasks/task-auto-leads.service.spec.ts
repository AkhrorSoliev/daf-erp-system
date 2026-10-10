import { Logger } from '@nestjs/common';
import { TASK_EVENTS } from './task-events';
import { autoCloseTasks, createSystemTask } from './task-auto-write';
import { TaskAutoLeadsService } from './task-auto-leads.service';

jest.mock('./task-auto-write', () => ({
  createSystemTask: jest.fn(),
  autoCloseTasks: jest.fn(),
}));

const SINCE = new Date('2026-10-11T04:00:00.000Z'); // the deploy
const MON_1000 = new Date('2026-10-12T05:00:00.000Z');
const SAT_1800 = new Date('2026-10-17T13:00:00.000Z');
const made = (id: string) => ({
  id,
  companyId: 1,
  title: 'X',
  kind: 'UNCALLED_LEAD',
  authorId: null,
  dueAt: null,
  status: 'NEW',
  participants: [],
});

interface PromiseTask {
  entityId: string;
  status: string;
  createdAt: Date;
  closedAt: Date | null;
}
const OPEN_STATUS = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'];

interface Opts {
  leads?: any[];
  openLeadTasks?: string[]; // leads that already have an open task
  closedLeadTasks?: string[]; // leads whose task was closed
  live?: string[]; // of those, the leads that still wait for a call
  openStudentTasks?: string[]; // students with an open BROKEN_PROMISE / CALLBACK
  archived?: number[];
  promises?: { id: string; branchId: number | null; studentId: number }[];
  promiseTasks?: PromiseTask[]; // BROKEN_PROMISE tasks of those students
}

function setup(opts: Opts = {}) {
  const prisma = {
    company: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 1, uncalledLeadTasksFrom: SINCE }]),
    },
    task: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.kind === 'UNCALLED_LEAD') {
          return [
            ...(opts.openLeadTasks ?? []).map((entityId) => ({
              entityId,
              status: 'NEW',
            })),
            ...(opts.closedLeadTasks ?? []).map((entityId) => ({
              entityId,
              status: 'DONE',
            })),
          ];
        }
        if (where.kind?.in) {
          return (opts.openStudentTasks ?? []).map((entityId) => ({
            entityId,
          }));
        }
        // The retry: a BROKEN_PROMISE task of the student that is open, made
        // today or closed today (the query's own OR, evaluated here).
        return (opts.promiseTasks ?? [])
          .filter(
            (t) =>
              where.entityId.in.includes(t.entityId) &&
              where.OR.some((c: any) =>
                c.status
                  ? OPEN_STATUS.includes(t.status)
                  : c.createdAt
                    ? t.createdAt >= c.createdAt.gte
                    : !!t.closedAt && t.closedAt >= c.closedAt.gte,
              ),
          )
          .map((t) => ({ entityId: t.entityId }));
      }),
    },
    lead: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.id?.in) {
          return (opts.live ?? []).map((id) => ({ id }));
        }
        const skip: string[] = where.id?.notIn ?? [];
        return (opts.leads ?? []).filter((l) => !skip.includes(l.id));
      }),
    },
    student: {
      findMany: jest.fn(async () =>
        (opts.archived ?? []).map((id) => ({ id })),
      ),
    },
    paymentPromise: {
      findMany: jest.fn().mockResolvedValue(opts.promises ?? []),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const emitter = { emit: jest.fn() };
  const taskAuto = { onPromisesBroken: jest.fn().mockResolvedValue(undefined) };
  (createSystemTask as jest.Mock)
    .mockReset()
    .mockImplementation(async (_p, i) => made(i.sourceKey));
  (autoCloseTasks as jest.Mock).mockReset().mockResolvedValue([]);
  return {
    prisma,
    emitter,
    taskAuto,
    service: new TaskAutoLeadsService(
      prisma as any,
      emitter as any,
      taskAuto as any,
    ),
  };
}
const lead = (id: string, branchId: number | null = 2) => ({
  id,
  firstName: 'Dilnoza',
  lastName: 'Karimova',
  branchId,
});

describe('TaskAutoLeadsService', () => {
  it.each([
    ['Sunday 10:00', new Date('2026-10-11T05:00:00.000Z')],
    ['Monday 07:59', new Date('2026-10-12T02:59:00.000Z')],
    ['Monday 19:00', new Date('2026-10-12T14:00:00.000Z')],
  ])('does nothing outside the window: %s', async (_label, now) => {
    const { service, prisma } = setup();
    expect(await service.run(now)).toEqual({ created: 0, closed: 0 });
    expect(prisma.company.findMany).not.toHaveBeenCalled();
  });

  it('asks only for new leads uncalled for 24 hours, created since the feature started', async () => {
    const { service, prisma } = setup({ leads: [lead('l1')] });
    await service.run(MON_1000);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1,
          calledAt: null,
          statusEnum: 'NEW',
          deletedAt: null,
          createdAt: { gte: SINCE, lt: new Date('2026-10-11T05:00:00.000Z') },
        },
      }),
    );
  });

  it('a task per lead, for its branch administrators, due today 18:00', async () => {
    const { service, emitter } = setup({ leads: [lead('l1')] });
    expect(await service.run(MON_1000)).toEqual({ created: 1, closed: 0 });
    expect(createSystemTask).toHaveBeenCalledWith(expect.anything(), {
      companyId: 1,
      branchId: 2,
      kind: 'UNCALLED_LEAD',
      title: "Lidga qo'ng'iroq qilinmagan: Karimova Dilnoza",
      description: null,
      dueAt: new Date('2026-10-12T13:00:00.000Z'),
      entityId: 'l1',
      sourceKey: 'lead:l1',
      assigneeIds: [3],
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ actorId: null, userIds: [3], created: true }),
    );
  });

  it('leads with an open task are left out of the query itself, so they never use up the batch', async () => {
    const { service, prisma } = setup({
      leads: [lead('l1'), lead('l2')],
      openLeadTasks: ['l1'],
      live: ['l1'],
    });
    expect(await service.run(MON_1000)).toEqual({ created: 1, closed: 0 });
    const where = prisma.lead.findMany.mock.calls.find(
      ([a]: any) => !a.where.id?.in,
    )![0].where;
    expect(where.id).toEqual({ notIn: ['l1'] });
    expect(createSystemTask).toHaveBeenCalledTimes(1);
    expect((createSystemTask as jest.Mock).mock.calls[0][1].entityId).toBe(
      'l2',
    );
  });

  it('a lead with no branch goes to the company administrators', async () => {
    const { service, prisma } = setup({ leads: [lead('l2', null)] });
    await service.run(MON_1000);
    expect(
      prisma.user.findMany.mock.calls[0][0].where.branches,
    ).toBeUndefined();
    expect(
      (createSystemTask as jest.Mock).mock.calls[0][1].branchId,
    ).toBeNull();
  });

  it('the Saturday 18:00 run is due on Monday 18:00, never already late', async () => {
    const { service } = setup({ leads: [lead('l1')] });
    await service.run(SAT_1800);
    expect((createSystemTask as jest.Mock).mock.calls[0][1].dueAt).toEqual(
      new Date('2026-10-19T13:00:00.000Z'),
    );
  });

  it('closes the task of a lead that no longer waits (called, archived, converted, not NEW)', async () => {
    const { service, emitter } = setup({
      openLeadTasks: ['l8', 'l9'],
      live: ['l8'],
    });
    (autoCloseTasks as jest.Mock).mockResolvedValue([made('t9')]);
    expect(await service.run(MON_1000)).toEqual({ created: 0, closed: 1 });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      expect.anything(),
      { companyId: 1, sourceKey: { in: ['lead:l9'] } },
      'LEAD_GONE',
    );
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.AUTO_CLOSED, {
      task: made('t9'),
      reason: 'LEAD_GONE',
    });
  });

  it('closes the promise and callback tasks of an archived student', async () => {
    const { service, emitter } = setup({
      openStudentTasks: ['10001', '10002', '10002'],
      archived: [10002],
    });
    (autoCloseTasks as jest.Mock).mockResolvedValue([made('t5')]);
    expect(await service.run(MON_1000)).toEqual({ created: 0, closed: 1 });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      expect.anything(),
      {
        companyId: 1,
        kind: { in: ['BROKEN_PROMISE', 'CALLBACK'] },
        entityType: 'Student',
        entityId: { in: ['10002'] },
      },
      'STUDENT_GONE',
    );
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.AUTO_CLOSED, {
      task: made('t5'),
      reason: 'STUDENT_GONE',
    });
  });

  it('no archived student, nothing to close', async () => {
    const { service } = setup({ openStudentTasks: ['10001'], archived: [] });
    expect(await service.run(MON_1000)).toEqual({ created: 0, closed: 0 });
    expect(autoCloseTasks).not.toHaveBeenCalled();
  });

  describe("retry of today's broken promises", () => {
    const OLD = new Date('2026-10-05T05:00:00.000Z');
    const TODAY_0900 = new Date('2026-10-12T04:00:00.000Z');
    const MON_1100 = new Date('2026-10-12T06:00:00.000Z');
    const MON_0930 = new Date('2026-10-12T04:30:00.000Z');
    const TODAY_START = new Date('2026-10-11T19:00:00.000Z');

    it('asks for those broken today that still owe, and hands the students without a task to the writer', async () => {
      const { service, prisma, taskAuto } = setup({
        promises: [
          { id: 'p1', branchId: 2, studentId: 10001 },
          { id: 'p2', branchId: 2, studentId: 10002 },
          { id: 'p3', branchId: null, studentId: 10003 },
        ],
        promiseTasks: [
          {
            entityId: '10002',
            status: 'NEW',
            createdAt: TODAY_0900,
            closedAt: null,
          },
        ],
      });
      await service.run(MON_1000);
      expect(prisma.paymentPromise.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1,
            status: 'BROKEN',
            reminderFiredAt: {
              gte: TODAY_START,
              lt: new Date('2026-10-12T19:00:00.000Z'),
            },
            student: { deletedAt: null, balance: { lte: -1000 } },
          },
        }),
      );
      expect(taskAuto.onPromisesBroken).toHaveBeenCalledTimes(2);
      expect(taskAuto.onPromisesBroken).toHaveBeenCalledWith(
        { companyId: 1, branchId: 2, promiseIds: ['p1'] },
        MON_1000,
      );
      expect(taskAuto.onPromisesBroken).toHaveBeenCalledWith(
        { companyId: 1, branchId: null, promiseIds: ['p3'] },
        MON_1000,
      );
    });

    it('a student with a task made today (even under another promise) is not retried', async () => {
      // Two promises of one student broke today; the event made one task.
      const { service, taskAuto } = setup({
        promises: [
          { id: 'p1', branchId: 2, studentId: 10001 },
          { id: 'p1b', branchId: 2, studentId: 10001 },
        ],
        promiseTasks: [
          {
            entityId: '10001',
            status: 'DONE',
            createdAt: TODAY_0900,
            closedAt: MON_0930,
          },
        ],
      });
      await service.run(MON_1000);
      expect(taskAuto.onPromisesBroken).not.toHaveBeenCalled();
    });

    it('an old task that was open at 09:00 made the event skip the new promise; closing it later brings no fresh task', async () => {
      const { service, taskAuto } = setup({
        promises: [{ id: 'p_new', branchId: 2, studentId: 10001 }],
        promiseTasks: [
          {
            entityId: '10001',
            status: 'DONE',
            createdAt: OLD,
            closedAt: MON_1100,
          },
        ],
      });
      await service.run(new Date('2026-10-12T07:00:00.000Z')); // 12:00, after the call
      expect(taskAuto.onPromisesBroken).not.toHaveBeenCalled();
    });

    it('the same old task still open: not retried either', async () => {
      const { service, taskAuto } = setup({
        promises: [{ id: 'p_new', branchId: 2, studentId: 10001 }],
        promiseTasks: [
          {
            entityId: '10001',
            status: 'IN_PROGRESS',
            createdAt: OLD,
            closedAt: null,
          },
        ],
      });
      await service.run(MON_1000);
      expect(taskAuto.onPromisesBroken).not.toHaveBeenCalled();
    });

    it('two promises of one student without any task go to the writer together (it makes one task)', async () => {
      const { service, taskAuto } = setup({
        promises: [
          { id: 'p1', branchId: 2, studentId: 10001 },
          { id: 'p1b', branchId: 2, studentId: 10001 },
        ],
      });
      await service.run(MON_1000);
      expect(taskAuto.onPromisesBroken).toHaveBeenCalledTimes(1);
      expect(taskAuto.onPromisesBroken).toHaveBeenCalledWith(
        { companyId: 1, branchId: 2, promiseIds: ['p1', 'p1b'] },
        MON_1000,
      );
    });

    it('the 09:00 hour belongs to the promise cron: no retry then', async () => {
      const { service, prisma, taskAuto } = setup({
        promises: [{ id: 'p1', branchId: 2, studentId: 10001 }],
      });
      await service.run(TODAY_0900);
      expect(prisma.paymentPromise.findMany).not.toHaveBeenCalled();
      expect(taskAuto.onPromisesBroken).not.toHaveBeenCalled();
    });
  });

  it('a lead whose task was closed (called) and then un-marked gets no fresh task', async () => {
    const { service, prisma } = setup({
      leads: [lead('l1'), lead('l2')],
      closedLeadTasks: ['l1'],
    });
    expect(await service.run(MON_1000)).toEqual({ created: 1, closed: 0 });
    const where = prisma.lead.findMany.mock.calls.find(
      ([a]: any) => !a.where.id?.in,
    )![0].where;
    expect(where.id).toEqual({ notIn: ['l1'] });
    expect((createSystemTask as jest.Mock).mock.calls[0][1].entityId).toBe(
      'l2',
    );
    // a closed task is nothing for the sweep to close
    expect(autoCloseTasks).not.toHaveBeenCalled();
  });

  it('one lead failing does not stop the rest of the batch', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = setup({ leads: [lead('l1'), lead('l2')] });
    (createSystemTask as jest.Mock)
      .mockReset()
      .mockRejectedValueOnce(new Error('db'))
      .mockImplementation(async (_p, i) => made(i.sourceKey));
    expect(await service.run(MON_1000)).toEqual({ created: 1, closed: 0 });
    expect(createSystemTask).toHaveBeenCalledTimes(2);
  });

  it('one failing step does not cost the company the others', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, prisma } = setup({
      openStudentTasks: ['10002'],
      archived: [10002],
    });
    prisma.lead.findMany.mockRejectedValue(new Error('db'));
    prisma.task.findMany.mockImplementation(async ({ where }: any) => {
      if (where.kind === 'UNCALLED_LEAD') return [];
      if (where.kind?.in) return [{ entityId: '10002' }];
      return [];
    });
    (autoCloseTasks as jest.Mock).mockResolvedValue([made('t5')]);
    expect(await service.run(MON_1000)).toEqual({ created: 0, closed: 1 });
  });

  describe('tick', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(MON_1000));
    afterEach(() => jest.useRealTimers());

    it('a run still going is not started twice, and the flag is released', async () => {
      const { service, prisma } = setup();
      let release!: () => void;
      prisma.company.findMany.mockReturnValueOnce(
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
      );
      const first = service.tick();
      await service.tick();
      expect(prisma.company.findMany).toHaveBeenCalledTimes(1);
      release();
      await first;
      await service.tick();
      expect(prisma.company.findMany).toHaveBeenCalledTimes(2);
    });

    it('the flag is released when a run throws', async () => {
      const { service, prisma } = setup();
      prisma.company.findMany.mockRejectedValueOnce(new Error('db down'));
      await expect(service.tick()).rejects.toThrow('db down');
      await service.tick();
      expect(prisma.company.findMany).toHaveBeenCalledTimes(2);
    });
  });
});

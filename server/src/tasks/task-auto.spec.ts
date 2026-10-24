import { TASK_EVENTS } from './task-events';
import { TaskAutoService } from './task-auto.service';
import { changeStatusTx } from './task-status-writes';
import { SYSTEM_CLOSES_MESSAGE, checkTransition } from './task-transitions';

const MON_0900 = new Date('2026-10-12T04:00:00.000Z');

/** Open tasks live in a map keyed by sourceKey, so a re-run really meets the first run's task. */
function fakeDb() {
  const open = new Map<string, { id: string; entityId: string }>();
  let seq = 0;
  const tx = {
    task: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `t${++seq}`,
          companyId: data.companyId,
          title: data.title,
          kind: data.kind,
          authorId: null,
          dueAt: data.dueAt,
          status: 'NEW',
          participants: data.participants.create,
        };
        open.set(data.sourceKey, { id: row.id, entityId: data.entityId });
        return row;
      }),
    },
    taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    task: {
      findFirst: jest.fn(async ({ where }: any) =>
        open.has(where.sourceKey)
          ? { id: open.get(where.sourceKey)!.id }
          : null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        [...open.values()]
          .filter((t) => where.entityId.in.includes(t.entityId))
          .map((t) => ({ entityId: t.entityId })),
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    paymentPromise: { findMany: jest.fn() },
    student: { findFirst: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]),
      findFirst: jest.fn().mockResolvedValue({ id: 9 }),
    },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, tx, open };
}

const promise = (
  id: string,
  studentId: number,
  balance: number,
  promiseDate = new Date('2026-10-09T18:59:59.999Z'),
) => ({
  id,
  promiseDate,
  promisedAmount: null,
  comment: null,
  student: { id: studentId, firstName: 'Aziz', lastName: 'Rahimov', balance },
});

function setup() {
  const db = fakeDb();
  const emitter = { emit: jest.fn() };
  return {
    ...db,
    emitter,
    service: new TaskAutoService(db.prisma as any, emitter as any),
  };
}

describe("TaskAutoService — «Buzilgan va'da»", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(MON_0900));
  afterEach(() => jest.useRealTimers());

  it('one task per broken promise, for the branch administrators, due today 18:00', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([
      promise('p1', 10001, -450_000),
      promise('p2', 10002, -120_000),
    ]);
    await service.onPromisesBroken(
      { companyId: 1, branchId: 2, promiseIds: ['p1', 'p2'] },
      MON_0900,
    );

    expect(tx.task.create).toHaveBeenCalledTimes(2);
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
      kind: 'BROKEN_PROMISE',
      priority: 'HIGH',
      authorId: null,
      branchId: 2,
      entityType: 'Student',
      entityId: '10001',
      sourceKey: 'promise:p1',
      title: "Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm",
      dueAt: new Date('2026-10-12T13:00:00.000Z'),
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({
        actorId: null,
        userIds: [3, 4],
        created: true,
      }),
    );
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it("a debt that fell under 1 000 so'm since the cron gets no task (the list rule)", async () => {
    const { service, prisma, tx } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([
      promise('p3', 10003, -999),
    ]);
    await service.onPromisesBroken(
      { companyId: 1, branchId: 2, promiseIds: ['p3'] },
      MON_0900,
    );
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('the same event heard twice writes one task and tells once', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([
      promise('p1', 10001, -450_000),
    ]);
    const p = { companyId: 1, branchId: 2, promiseIds: ['p1'] };
    await service.onPromisesBroken(p, MON_0900);
    await service.onPromisesBroken(p, MON_0900);
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('two promises of one student give one task, for the latest promise', async () => {
    const { service, prisma, tx } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([
      promise('old', 10001, -450_000, new Date('2026-10-02T18:59:59.999Z')),
      promise('new', 10001, -450_000, new Date('2026-10-09T18:59:59.999Z')),
    ]);
    await service.onPromisesBroken(
      { companyId: 1, branchId: 2, promiseIds: ['old', 'new'] },
      MON_0900,
    );
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create.mock.calls[0][0].data.sourceKey).toBe('promise:new');
  });

  it('a student who already has an open broken-promise task gets no second one', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([
      promise('p1', 10001, -450_000),
      promise('p2', 10002, -120_000),
    ]);
    // 10001 has an open task born of an earlier promise
    prisma.task.findMany.mockResolvedValue([{ entityId: '10001' }]);
    await service.onPromisesBroken(
      { companyId: 1, branchId: 2, promiseIds: ['p1', 'p2'] },
      MON_0900,
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: 'BROKEN_PROMISE',
          entityId: { in: ['10001', '10002'] },
        }),
      }),
    );
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create.mock.calls[0][0].data.entityId).toBe('10002');
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });
});

describe("TaskAutoService — «Qayta qo'ng'iroq»", () => {
  const callLog = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    companyId: 1,
    studentId: 10001,
    branchId: 2,
    calledById: 9,
    note: 'Ertaga qayta',
    reason: 'DEBT',
    outcome: 'NO_ANSWER',
    // 23:00 Tashkent of Wednesday 14.10 — what the call dialog sends
    followUpAt: new Date('2026-10-14T18:00:00.000Z'),
    createdAt: MON_0900,
    ...over,
  });

  beforeEach(() => jest.useFakeTimers().setSystemTime(MON_0900));
  afterEach(() => jest.useRealTimers());

  it('a task for the caller on the follow-up day, 18:00', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Aziz',
      lastName: 'Rahimov',
    });
    await service.onCallLogged({ callLog: callLog() } as any, MON_0900);
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
      kind: 'CALLBACK',
      priority: 'MEDIUM',
      sourceKey: 'calllog:c1',
      entityType: 'Student',
      entityId: '10001',
      title: "Qayta qo'ng'iroq: Rahimov Aziz",
      description: "Oldingi qo'ng'iroq izohi: Ertaga qayta",
      dueAt: new Date('2026-10-14T13:00:00.000Z'),
      participants: { create: [{ userId: 9, role: 'ASSIGNEE' }] },
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ userIds: [9], created: true, actorId: null }),
    );
  });

  it('no follow-up date, or a caller who has left: no task', async () => {
    const { service, prisma, tx } = setup();
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Aziz',
      lastName: 'Rahimov',
    });
    await service.onCallLogged(
      { callLog: callLog({ followUpAt: null }) } as any,
      MON_0900,
    );
    prisma.user.findFirst.mockResolvedValue(null);
    await service.onCallLogged(
      { callLog: callLog({ id: 'c2' }) } as any,
      MON_0900,
    );
    expect(tx.task.create).not.toHaveBeenCalled();
  });
});

describe('claim — the first administrator to act takes a system task', () => {
  it('starting it takes it; the other copy goes', async () => {
    const tx = {
      taskParticipant: {
        findMany: jest.fn().mockResolvedValue([{ userId: 3 }, { userId: 4 }]),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      unmarkedLesson: { updateMany: jest.fn() },
      task: { update: jest.fn().mockResolvedValue({ id: 't1' }) },
      taskOutbox: { deleteMany: jest.fn() },
      taskEvent: { create: jest.fn() },
    };
    const ctx = {
      row: {
        id: 't1',
        kind: 'BROKEN_PROMISE',
        status: 'NEW',
        authorId: null,
        claimedById: null,
        requiresPhoto: false,
        startedAt: null,
        participants: [
          { userId: 3, role: 'ASSIGNEE' },
          { userId: 4, role: 'ASSIGNEE' },
        ],
      },
      access: { canWork: true, isAssignee: true },
    };
    await changeStatusTx(tx as any, ctx as any, 'IN_PROGRESS', 3);
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { claimedById: 3 },
    });
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
    });
  });

  it('nobody closes it by hand', () => {
    expect(
      checkTransition({
        from: 'IN_PROGRESS',
        to: 'DONE',
        by: 'ASSIGNEE',
        selfTask: false,
        kind: 'CALLBACK',
        requiresPhoto: false,
        hasFreshPhoto: false,
      }),
    ).toEqual({ ok: false, message: SYSTEM_CLOSES_MESSAGE });
  });
});

describe('TaskAutoService — «Pul ushlab qolindi»', () => {
  const payload = {
    companyId: 1,
    branchId: 2,
    studentId: 10149,
    enrollmentId: 'enr-1',
    groupName: '#005',
    amount: 242_305,
    held: 6,
    covered: 13,
    percent: 46,
    departureDay: '2026-10-14',
    reason: 'Boshqa guruhga ko‘chdi',
  };

  it('opens one HIGH task per enrollment for the branch administrators, due today 18:00', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Sherzodbek',
      lastName: 'Ruziev',
    });
    await service.onDepartureWithheld(payload, MON_0900);
    await service.onDepartureWithheld(payload, MON_0900);

    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
      kind: 'HELD_MONTH',
      priority: 'HIGH',
      authorId: null,
      branchId: 2,
      entityType: 'Student',
      entityId: '10149',
      sourceKey: 'held:enr-1',
      title: "Oy puli ushlab qolindi: Ruziev Sherzodbek — 242 305 so'm",
    });
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('nothing held, nothing to look at', async () => {
    const { service, tx } = setup();
    await service.onDepartureWithheld({ ...payload, amount: 0 }, MON_0900);
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('the assignee may close it, nobody else may close a system task', () => {
    const base = {
      from: 'NEW',
      to: 'DONE',
      selfTask: false,
      requiresPhoto: false,
      hasFreshPhoto: true,
    } as const;
    expect(
      checkTransition({ ...base, by: 'ASSIGNEE', kind: 'HELD_MONTH' }),
    ).toEqual({ ok: true });
    expect(
      checkTransition({ ...base, by: 'ASSIGNEE', kind: 'CALLBACK' }),
    ).toEqual({ ok: false, message: SYSTEM_CLOSES_MESSAGE });
    expect(
      checkTransition({ ...base, by: 'MANAGER', kind: 'HELD_MONTH' }),
    ).toEqual({ ok: false, message: SYSTEM_CLOSES_MESSAGE });
  });
});

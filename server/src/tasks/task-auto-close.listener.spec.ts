import { Logger } from '@nestjs/common';
import { TASK_EVENTS } from './task-events';
import { autoCloseTasks } from './task-auto-write';
import { TaskAutoCloseListener } from './task-auto-close.listener';

jest.mock('./task-auto-write', () => ({ autoCloseTasks: jest.fn() }));

const closed = {
  id: 't1',
  companyId: 1,
  title: 'X',
  kind: 'CALLBACK',
  authorId: null,
  dueAt: null,
  status: 'DONE',
  participants: [],
};
const STUDENT = { companyId: 1, entityType: 'Student', entityId: '10001' };

function setup() {
  const prisma = {};
  const emitter = { emit: jest.fn() };
  (autoCloseTasks as jest.Mock).mockReset().mockResolvedValue([closed]);
  return {
    listener: new TaskAutoCloseListener(prisma as any, emitter as any),
    prisma,
    emitter,
  };
}

describe('TaskAutoCloseListener', () => {
  it('a payment that clears the debt closes the promise and callback tasks, credited to who took it', async () => {
    const { listener, prisma, emitter } = setup();
    await listener.onPayment({
      companyId: 1,
      studentId: 10001,
      studentBalance: 0,
      performedById: 7,
    });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { ...STUDENT, kind: { in: ['BROKEN_PROMISE', 'CALLBACK'] } },
      'PAYMENT_RECEIVED',
      undefined,
      7,
    );
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.AUTO_CLOSED, {
      task: closed,
      reason: 'PAYMENT_RECEIVED',
    });
  });

  it('a partial payment closes the callback only; the broken promise stays', async () => {
    const { listener, prisma } = setup();
    await listener.onPayment({
      companyId: 1,
      studentId: 10001,
      studentBalance: -500_000,
    });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { ...STUDENT, kind: { in: ['CALLBACK'] } },
      'PAYMENT_RECEIVED',
      undefined,
      null,
    );
  });

  it('a payment with an unknown balance does not close the broken promise', async () => {
    const { listener, prisma } = setup();
    await listener.onPayment({
      companyId: 1,
      studentId: 10001,
      studentBalance: null,
    });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { ...STUDENT, kind: { in: ['CALLBACK'] } },
      'PAYMENT_RECEIVED',
      undefined,
      null,
    );
  });

  it('a call log closes both, but never the callback it has just asked for', async () => {
    const { listener, prisma } = setup();
    await listener.onCallLogged({
      callLog: { id: 'c9', companyId: 1, studentId: 10001, calledById: 5 },
    } as any);
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      {
        ...STUDENT,
        sourceKey: { not: 'calllog:c9' },
        kind: { in: ['BROKEN_PROMISE', 'CALLBACK'] },
      },
      'CALL_LOGGED',
      undefined,
      5,
    );
  });

  it('marking the lead called closes its task, credited to who marked it', async () => {
    const { listener, prisma } = setup();
    await listener.onLeadCalled({ leadId: 'l1', companyId: 1, userId: 8 });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { companyId: 1, sourceKey: 'lead:l1', kind: { in: ['UNCALLED_LEAD'] } },
      'LEAD_CALLED',
      undefined,
      8,
    );
  });

  it("a lead's status change closes it; another entity's does not", async () => {
    const { listener, prisma } = setup();
    await listener.onStatus({
      entityType: 'Group',
      entityId: 'g1',
      companyId: 1,
    });
    expect(autoCloseTasks).not.toHaveBeenCalled();
    await listener.onStatus({
      entityType: 'Lead',
      entityId: 'l1',
      companyId: 1,
      changedById: 7,
    });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { companyId: 1, sourceKey: 'lead:l1', kind: { in: ['UNCALLED_LEAD'] } },
      'LEAD_STATUS_CHANGED',
      undefined,
      7,
    );
  });

  it('a failure is logged, never thrown', async () => {
    const { listener, emitter } = setup();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    (autoCloseTasks as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(
      listener.onPayment({ companyId: 1, studentId: 10001, studentBalance: 0 }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

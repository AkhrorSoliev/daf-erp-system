import { TASK_EVENTS } from './task-events';
import { autoCloseTasks } from './task-auto-write';
import { TaskAutoLeadsService } from './task-auto-leads.service';

jest.mock('./task-auto-write', () => ({
  createSystemTask: jest.fn(),
  autoCloseTasks: jest.fn(),
}));

const closed = { id: 't1', companyId: 1, kind: 'HELD_MONTH' };

function setup(sourceKeys: string[], released: string[]) {
  const prisma = {
    task: {
      findMany: jest
        .fn()
        .mockResolvedValue(sourceKeys.map((sourceKey) => ({ sourceKey }))),
    },
    enrollmentMonthlyCharge: {
      findMany: jest
        .fn()
        .mockResolvedValue(released.map((enrollmentId) => ({ enrollmentId }))),
    },
  };
  const emitter = { emit: jest.fn() };
  (autoCloseTasks as jest.Mock).mockReset().mockResolvedValue([closed]);
  const service = new TaskAutoLeadsService(
    prisma as any,
    emitter as any,
    {} as any,
  );
  return { service, prisma, emitter };
}

describe('TaskAutoLeadsService — released held month', () => {
  it('closes the task of an enrollment whose month was given back', async () => {
    const { service, emitter } = setup(['held:e1', 'held:e2'], ['e1']);
    expect(await (service as any).closeReleasedMonths(1)).toBe(1);
    expect(autoCloseTasks).toHaveBeenCalledWith(
      expect.anything(),
      { companyId: 1, kind: 'HELD_MONTH', sourceKey: { in: ['held:e1'] } },
      'MONTH_RELEASED',
    );
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.AUTO_CLOSED, {
      task: closed,
      reason: 'MONTH_RELEASED',
    });
  });

  it('nothing open, nothing asked', async () => {
    const { service, prisma } = setup([], []);
    expect(await (service as any).closeReleasedMonths(1)).toBe(0);
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });
});

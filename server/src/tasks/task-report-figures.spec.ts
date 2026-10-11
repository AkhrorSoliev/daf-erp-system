import { loadTaskReportFigures } from './task-report-figures';

const NOW = new Date('2026-10-12T16:00:00.000Z');
const OPEN = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'];

it("counts open and overdue tasks of the report's branches and names the most behind", async () => {
  const db = {
    task: { count: jest.fn(async ({ where }: any) => (where.dueAt ? 4 : 12)) },
    taskParticipant: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ userId: 40, _count: { userId: 3 } }]),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: 'Aziz', lastName: 'Rahimov' }),
    },
  };
  expect(await loadTaskReportFigures(db as any, 1, [2], NOW)).toEqual({
    open: 12,
    overdue: 4,
    leader: { name: 'Aziz Rahimov', overdue: 3 },
  });
  const scope = { companyId: 1, status: { in: OPEN }, branchId: { in: [2] } };
  expect(db.task.count).toHaveBeenCalledWith({ where: scope });
  expect(db.task.count).toHaveBeenCalledWith({
    where: { ...scope, dueAt: { lt: NOW } },
  });
  expect(db.taskParticipant.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        role: 'ASSIGNEE',
        task: { ...scope, dueAt: { lt: NOW } },
        user: { deletedAt: null, isActive: true, status: 'ACTIVE' },
      },
      orderBy: [{ _count: { userId: 'desc' } }, { userId: 'asc' }],
    }),
  );
});

it('the whole company when the report has no branch filter', async () => {
  const db = {
    task: { count: jest.fn().mockResolvedValue(0) },
    taskParticipant: { groupBy: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn() },
  };
  expect(await loadTaskReportFigures(db as any, 1, null, NOW)).toEqual({
    open: 0,
    overdue: 0,
    leader: null,
  });
  expect(db.task.count.mock.calls[0][0].where.branchId).toBeUndefined();
});

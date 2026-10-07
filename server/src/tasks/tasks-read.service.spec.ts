import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TasksReadService, collapseBatches } from './tasks-read.service';
import { decodeCursor } from './task-cursor';
import type { TaskActor } from './tasks.service';

const person = (id: number) => ({
  id,
  firstName: `F${id}`,
  lastName: `L${id}`,
  photo: null,
});

function makeCard(over: Record<string, unknown> = {}) {
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
    createdAt: new Date('2026-10-07T05:00:00.000Z'),
    updatedAt: new Date('2026-10-07T05:00:00.000Z'),
    author: person(30),
    participants: [
      { userId: 40, role: 'ASSIGNEE', seenAt: null, user: person(40) },
    ],
    _count: { steps: 0, events: 1 },
    steps: [],
    unmarkedLesson: null,
    ...over,
  };
}

const admin = (): TaskActor => ({
  userId: 30,
  companyId: 1,
  roleIds: [3],
  roleNames: ['Administrator'],
  scope: { kind: 'branches', branchIds: [1] },
  headerBranchId: 1,
});
const director = (): TaskActor => ({
  ...admin(),
  userId: 20,
  roleIds: [2],
  roleNames: ['Branch Director'],
});
const ceo = (): TaskActor => ({
  ...admin(),
  userId: 1,
  roleIds: [1],
  roleNames: ['CEO'],
  scope: { kind: 'all' },
});

describe('TasksReadService', () => {
  let prisma: any;
  let tasks: { loadForAccess: jest.Mock; actorPerson: jest.Mock };
  let service: TasksReadService;

  beforeEach(() => {
    prisma = {
      task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
      taskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      taskParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tasks = {
      loadForAccess: jest.fn(),
      actorPerson: jest.fn((a: TaskActor) => ({
        id: a.userId,
        roleIds: a.roleIds,
        branchIds: a.scope.kind === 'all' ? 'all' : a.scope.branchIds,
      })),
    };
    service = new TasksReadService(prisma, tasks as any);
  });

  describe('list', () => {
    it('refuses the «all» view to someone who is not a director', async () => {
      await expect(service.list({ view: 'all' }, admin())).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    it('scopes every query to the actor company', async () => {
      await service.list({ view: 'my' }, admin());
      expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: 1,
      });
    });

    it('a branch director sees own tasks plus their branch, a CEO everything', async () => {
      await service.list({ view: 'all' }, director());
      const dirWhere = prisma.task.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(dirWhere)).toContain('"branchId":{"in":[1]}');
      await service.list({ view: 'all' }, ceo());
      const ceoWhere = prisma.task.findMany.mock.calls[1][0].where;
      expect(JSON.stringify(ceoWhere)).not.toContain('"branchId"');
    });

    it('returns a keyset cursor only when there is one more row than the limit', async () => {
      const rows = [
        makeCard({ id: 'c', createdAt: new Date('2026-10-07T07:00:00.000Z') }),
        makeCard({ id: 'b', createdAt: new Date('2026-10-07T06:00:00.000Z') }),
        makeCard({ id: 'a', createdAt: new Date('2026-10-07T05:00:00.000Z') }),
      ];
      prisma.task.findMany.mockResolvedValue(rows);
      const page = await service.list({ view: 'my', limit: 2 }, admin());
      expect(page.data.map((c) => c.id)).toEqual(['c', 'b']);
      expect(decodeCursor(page.nextCursor ?? undefined)).toEqual({
        createdAt: new Date('2026-10-07T06:00:00.000Z'),
        id: 'b',
      });

      prisma.task.findMany.mockResolvedValue(rows.slice(0, 2));
      const last = await service.list({ view: 'my', limit: 2 }, admin());
      expect(last.nextCursor).toBeNull();
    });

    it('«created» collapses separate copies into one card', async () => {
      prisma.task.findMany.mockResolvedValue([
        makeCard({ id: 'a', batchId: 'B', status: 'DONE' }),
        makeCard({
          id: 'b',
          batchId: 'B',
          participants: [
            { userId: 41, role: 'ASSIGNEE', seenAt: null, user: person(41) },
          ],
        }),
      ]);
      const page = await service.list({ view: 'created' }, admin());
      expect(page.data).toHaveLength(1);
      expect(page.data[0].batch).toEqual({
        total: 2,
        done: 1,
        statuses: ['DONE', 'NEW'],
      });
      expect(page.data[0].assignees.map((a) => a.id)).toEqual([40, 41]);
    });
  });

  describe('collapseBatches', () => {
    it('leaves batch-less cards alone', () => {
      const cards = [{ batchId: null, status: 'NEW' as const, assignees: [] }];
      expect(collapseBatches(cards)).toEqual(cards);
    });
  });

  describe('detail', () => {
    const access = (over: Record<string, boolean> = {}) => ({
      isAuthor: false,
      isAssignee: true,
      isWatcher: false,
      isManager: false,
      canView: true,
      canManage: false,
      canWork: true,
      ...over,
    });

    it('rejects an unparseable «before» without querying', async () => {
      await expect(service.detail('t1', admin(), 'not-a-date')).rejects.toThrow(
        BadRequestException,
      );
      expect(tasks.loadForAccess).not.toHaveBeenCalled();
    });

    it('lists batch copies only for the author or a manager, scoped by company', async () => {
      const row = { ...makeCard({ batchId: 'B' }), description: null };
      tasks.loadForAccess.mockResolvedValue({
        row: { ...row, lastReturnedAt: null, cancelReason: null, steps: [] },
        access: access(),
      });
      const asAssignee = await service.detail('t1', admin());
      expect(asAssignee.batch).toEqual([]);
      expect(prisma.task.findMany).not.toHaveBeenCalled();

      tasks.loadForAccess.mockResolvedValue({
        row: { ...row, lastReturnedAt: null, cancelReason: null, steps: [] },
        access: access({ isAuthor: true }),
      });
      prisma.task.findMany.mockResolvedValue([makeCard({ batchId: 'B' })]);
      const asAuthor = await service.detail('t1', admin());
      expect(asAuthor.batch).toHaveLength(1);
      expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({
        batchId: 'B',
        companyId: 1,
      });
    });
  });

  describe('workload', () => {
    it('is closed to anyone below a branch director', async () => {
      await expect(service.workload({}, admin())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('counts open, overdue, done this month and the on-time share per assignee', async () => {
      const past = new Date(Date.now() - 864e5);
      const user = {
        ...person(40),
        roles: [{ role: { name: 'Teacher' } }],
        branches: [{ branch: { name: 'Fargona' } }],
      };
      const part = (task: Record<string, unknown>) => ({
        userId: 40,
        user,
        task,
      });
      prisma.taskParticipant.findMany.mockResolvedValue([
        part({ status: 'NEW', dueAt: past, closedAt: null }),
        part({ status: 'IN_PROGRESS', dueAt: null, closedAt: null }),
        part({
          status: 'DONE',
          dueAt: new Date('2026-10-05T13:00:00.000Z'),
          closedAt: new Date('2026-10-05T10:00:00.000Z'),
        }),
        part({
          status: 'DONE',
          dueAt: new Date('2026-10-05T13:00:00.000Z'),
          closedAt: new Date('2026-10-06T10:00:00.000Z'),
        }),
      ]);
      const out = await service.workload({ month: '2026-10' }, director());
      expect(out.month).toBe('2026-10');
      expect(out.data).toEqual([
        {
          user: {
            id: 40,
            firstName: 'F40',
            lastName: 'L40',
            photo: null,
            roleNames: ['Teacher'],
            branchNames: ['Fargona'],
          },
          open: 2,
          overdue: 1,
          doneThisMonth: 2,
          onTimePercent: 50,
        },
      ]);
      expect(out.totals).toEqual({ open: 2, overdue: 1, doneThisMonth: 2 });
    });
  });

  describe('assignable', () => {
    const staff = (id: number, roleId: number, branchId = 1) => ({
      id,
      firstName: `F${id}`,
      lastName: `L${id}`,
      photo: null,
      telegramChatId: id === 40 ? 'chat' : null,
      mainBranch: branchId,
      roles: [{ role: { id: roleId, name: `R${roleId}` } }],
      branches: [{ branchId, branch: { name: `B${branchId}` } }],
    });

    it('offers the ladder to assign and the wider set to watch', async () => {
      prisma.user.findMany.mockResolvedValue([
        staff(30, 3), // the caller
        staff(40, 4), // teacher
        staff(20, 2), // branch director: above an administrator
      ]);
      const out = await service.assignable(admin());
      expect(out.assignees.map((u) => u.id)).toEqual([30, 40]);
      expect(out.watchers.map((u) => u.id)).toEqual([30, 40, 20]);
      expect(out.assignees[1]).toMatchObject({
        telegramLinked: true,
        branchNames: ['B1'],
      });
      expect(out.ladder).toEqual([3, 4, 5]);
    });

    it('confines a non-CEO caller to their branches in the query', async () => {
      await service.assignable(admin());
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(1);
      expect(JSON.stringify(where.OR)).toContain('"in":[1]');
    });
  });
});

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
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
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
      prisma.task.groupBy.mockResolvedValue([
        { batchId: 'B', status: 'DONE', _count: { _all: 1 } },
        { batchId: 'B', status: 'NEW', _count: { _all: 1 } },
      ]);
      const page = await service.list({ view: 'created' }, admin());
      expect(page.data).toHaveLength(1);
      expect(page.data[0].batch).toEqual({
        total: 2,
        done: 1,
        statuses: ['NEW', 'DONE'],
      });
      expect(page.data[0].assignees.map((a) => a.id)).toEqual([40, 41]);
    });

    it('«created» totals count the whole batch, not just the filtered page', async () => {
      // Filtered to DONE, the page holds one copy of a five-copy batch.
      prisma.task.findMany.mockResolvedValue([
        makeCard({ id: 'a', batchId: 'B', status: 'DONE' }),
      ]);
      prisma.task.groupBy.mockResolvedValue([
        { batchId: 'B', status: 'NEW', _count: { _all: 2 } },
        { batchId: 'B', status: 'DONE', _count: { _all: 3 } },
      ]);
      const page = await service.list(
        { view: 'created', status: ['DONE'] },
        admin(),
      );
      expect(prisma.task.groupBy).toHaveBeenCalledWith({
        by: ['batchId', 'status'],
        where: { companyId: 1, batchId: { in: ['B'] } },
        _count: { _all: true },
      });
      expect(page.data).toHaveLength(1);
      expect(page.data[0].batch).toEqual({
        total: 5,
        done: 3,
        statuses: ['NEW', 'NEW', 'DONE', 'DONE', 'DONE'],
      });
    });

    it('«all» collapses separate copies for a manager, totals counting the whole batch', async () => {
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
      prisma.task.groupBy.mockResolvedValue([
        { batchId: 'B', status: 'DONE', _count: { _all: 1 } },
        { batchId: 'B', status: 'NEW', _count: { _all: 3 } },
      ]);
      const page = await service.list({ view: 'all' }, director());
      expect(prisma.task.groupBy).toHaveBeenCalledWith({
        by: ['batchId', 'status'],
        where: { companyId: 1, batchId: { in: ['B'] } },
        _count: { _all: true },
      });
      expect(page.data).toHaveLength(1);
      expect(page.data[0].batch).toEqual({
        total: 4,
        done: 1,
        statuses: ['NEW', 'NEW', 'NEW', 'DONE'],
      });
      expect(page.data[0].assignees.map((a) => a.id)).toEqual([40, 41]);
    });

    it('does not count batches at all when no copy is on the page, or on «my»', async () => {
      await service.list({ view: 'created' }, admin());
      prisma.task.findMany.mockResolvedValue([
        makeCard({ id: 'a', batchId: 'B' }),
      ]);
      await service.list({ view: 'my' }, admin());
      expect(prisma.task.groupBy).not.toHaveBeenCalled();
    });

    it('refuses a cursor that does not decode instead of serving page one', async () => {
      await expect(
        service.list({ view: 'my', cursor: 'zzz' }, admin()),
      ).rejects.toThrow("Sahifa belgisi noto'g'ri");
      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });

    describe('the closed window', () => {
      it.each([[['DONE']], [['DONE', 'CANCELLED']], [['CANCELLED']]])(
        'limits DONE (by closedAt) and CANCELLED (by cancelledAt) rows to closedDays when the status filter is %j',
        async (status) => {
          const before = Date.now();
          await service.list({ view: 'my', status, closedDays: 3 }, admin());
          const and = prisma.task.findMany.mock.calls[0][0].where.AND;
          const clause = and.find((c: any) => c.OR?.[0]?.status?.notIn);
          expect(clause).toEqual({
            OR: [
              { status: { notIn: ['DONE', 'CANCELLED'] } },
              { status: 'DONE', closedAt: { gte: expect.any(Date) } },
              {
                status: 'CANCELLED',
                cancelledAt: { gte: expect.any(Date) },
              },
            ],
          });
          for (const gte of [
            clause.OR[1].closedAt.gte,
            clause.OR[2].cancelledAt.gte,
          ] as Date[]) {
            expect(gte.getTime()).toBeGreaterThanOrEqual(before - 3 * 864e5);
            expect(gte.getTime()).toBeLessThanOrEqual(Date.now() - 3 * 864e5);
          }
          expect(and).toContainEqual({ status: { in: status } });
        },
      );

      it('defaults to 14 days', async () => {
        const before = Date.now();
        await service.list({ view: 'my', status: ['DONE'] }, admin());
        const and = prisma.task.findMany.mock.calls[0][0].where.AND;
        const clause = and.find((c: any) => c.OR?.[0]?.status?.notIn);
        for (const gte of [
          clause.OR[1].closedAt.gte,
          clause.OR[2].cancelledAt.gte,
        ] as Date[]) {
          expect(gte.getTime()).toBeGreaterThanOrEqual(before - 14 * 864e5);
          expect(gte.getTime()).toBeLessThanOrEqual(Date.now() - 14 * 864e5);
        }
      });

      it('leaves the open statuses unwindowed', async () => {
        await service.list(
          { view: 'my', status: ['NEW', 'IN_REVIEW'] },
          admin(),
        );
        const where = JSON.stringify(
          prisma.task.findMany.mock.calls[0][0].where,
        );
        expect(where).not.toContain('closedAt');
        expect(where).not.toContain('cancelledAt');
      });
    });
  });

  describe('collapseBatches', () => {
    it('leaves batch-less cards alone', () => {
      const cards = [{ batchId: null, status: 'NEW' as const, assignees: [] }];
      expect(collapseBatches(cards, new Map())).toEqual(cards);
    });

    it('merges assignees into a copy of the head list, never into the input', () => {
      const a = {
        batchId: 'B',
        status: 'NEW' as const,
        assignees: [{ id: 1 }],
      };
      const b = {
        batchId: 'B',
        status: 'NEW' as const,
        assignees: [{ id: 2 }],
      };
      const out = collapseBatches([a, b], new Map());
      expect(out).toHaveLength(1);
      expect(out[0].assignees).toEqual([{ id: 1 }, { id: 2 }]);
      expect(a.assignees).toEqual([{ id: 1 }]);
    });

    it('prefers the batch totals over the copies on the page', () => {
      const card = { batchId: 'B', status: 'DONE' as const, assignees: [] };
      const stats = new Map([
        ['B', { total: 5, done: 3, statuses: [] as ('NEW' | 'DONE')[] }],
      ]);
      expect(collapseBatches([card], stats)[0].batch).toBe(stats.get('B'));
      expect(collapseBatches([card], new Map())[0].batch).toEqual({
        total: 1,
        done: 1,
        statuses: ['DONE'],
      });
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

  describe('counts', () => {
    it('counts «created» once per batch', async () => {
      // Two single tasks, and one batch of three copies that are all open.
      prisma.task.count.mockImplementation(
        ({ where }: { where: { batchId?: null; status?: unknown } }) =>
          Promise.resolve(where.batchId === null ? 2 : 0),
      );
      prisma.task.findMany.mockResolvedValue([{ batchId: 'B' }]);
      const out = await service.counts(admin());
      expect(out.created).toBe(3);
      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 1,
          authorId: 30,
          status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] },
          batchId: { not: null },
        },
        distinct: ['batchId'],
        select: { batchId: true },
      });
    });

    it('keeps «my», «myOverdue» and «review» as plain counts', async () => {
      prisma.task.count
        .mockResolvedValueOnce(4) // my
        .mockResolvedValueOnce(1) // myOverdue
        .mockResolvedValueOnce(0) // created, singles
        .mockResolvedValueOnce(2); // review
      const out = await service.counts(admin());
      expect(out).toEqual({ my: 4, myOverdue: 1, created: 0, review: 2 });
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
      expect(out.totals).toEqual({
        open: 2,
        overdue: 1,
        doneThisMonth: 2,
        onTime: 1,
        withDue: 2,
      });
    });

    it('totals carry the on-time counters summed over everyone, not an average of shares', async () => {
      const mk = (id: number) => ({
        ...person(id),
        roles: [{ role: { name: 'Teacher' } }],
        branches: [],
      });
      const done = (userId: number, closed: string, due: string | null) => ({
        userId,
        user: mk(userId),
        task: {
          status: 'DONE',
          dueAt: due ? new Date(due) : null,
          closedAt: new Date(closed),
        },
      });
      prisma.taskParticipant.findMany.mockResolvedValue([
        // 40: one task closed, with a due date, on time (100%)
        done(40, '2026-10-05T10:00:00.000Z', '2026-10-05T13:00:00.000Z'),
        // 41: three closed, only one with a due date, and late (0%)
        done(41, '2026-10-06T10:00:00.000Z', '2026-10-05T13:00:00.000Z'),
        done(41, '2026-10-06T10:00:00.000Z', null),
        done(41, '2026-10-06T10:00:00.000Z', null),
      ]);
      const out = await service.workload({ month: '2026-10' }, director());
      expect(out.data.map((d) => [d.user.id, d.onTimePercent])).toEqual(
        expect.arrayContaining([
          [40, 100],
          [41, 0],
        ]),
      );
      // 1 on time of 2 with a due date = 50%; the mean of 100 and 0 weighted by closed tasks would say 25.
      expect(out.totals).toMatchObject({
        doneThisMonth: 4,
        onTime: 1,
        withDue: 2,
      });
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

    it('confines a non-CEO caller to their branches in the query, CEOs aside', async () => {
      await service.assignable(admin());
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(1);
      expect(JSON.stringify(where.OR)).toContain('"in":[1]');
      expect(where.OR).toContainEqual({
        roles: { some: { role: { id: 1 } } },
      });
    });

    it('offers a branch-less CEO as a watcher, never as an assignee', async () => {
      const boss = { ...staff(1, 1), mainBranch: null, branches: [] };
      prisma.user.findMany.mockResolvedValue([
        staff(30, 3),
        staff(40, 4),
        boss,
      ]);
      const out = await service.assignable(admin());
      expect(out.watchers.map((u) => u.id)).toEqual([30, 40, 1]);
      expect(out.assignees.map((u) => u.id)).toEqual([30, 40]);
      expect(out.watchers[2].branchNames).toEqual([]);
    });

    it('does not widen the query for a CEO caller', async () => {
      await service.assignable(ceo());
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
    });
  });
});

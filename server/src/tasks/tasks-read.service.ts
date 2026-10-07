import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SIGN_IN_USER_STATUSES } from '../common/auth/blocked-user';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayRangeUtc,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
  tashkentRangeUtc,
} from '../common/date/tashkent';
import {
  TASK_CARD_SELECT,
  TASK_EVENT_SELECT,
  toTaskCard,
  toTaskDetail,
  type TaskCard,
} from './task-select';
import { OPEN_STATUSES } from './task-transitions';
import { decodeCursor, encodeCursor } from './task-cursor';
import {
  assignableRoleIds,
  canAssignTo,
  canWatch,
  highestRoleId,
} from './task-policy';
import { TasksService, toPolicyPerson, type TaskActor } from './tasks.service';
import type { ListTasksDto } from './dto/list-tasks.dto';
import type { WorkloadQueryDto } from './dto/workload-query.dto';

const OPEN = [...OPEN_STATUSES];
const STATUS_ORDER: TaskStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
];

@Injectable()
export class TasksReadService {
  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
  ) {}

  /** Who may see which tasks (spec §5.2) as a Prisma where fragment. */
  private visibilityWhere(actor: TaskActor): Prisma.TaskWhereInput {
    const mine: Prisma.TaskWhereInput = {
      OR: [
        { authorId: actor.userId },
        { participants: { some: { userId: actor.userId } } },
      ],
    };
    if (actor.scope.kind === 'all') return {};
    if (highestRoleId(actor.roleIds) === 2 && actor.scope.branchIds.length) {
      return { OR: [mine, { branchId: { in: actor.scope.branchIds } }] };
    }
    return mine;
  }

  private dueWhere(due: ListTasksDto['due']): Prisma.TaskWhereInput {
    const now = new Date();
    const today = tashkentDateStr(now);
    if (due === 'overdue') return { dueAt: { lt: now }, status: { in: OPEN } };
    if (due === 'today') return { dueAt: tashkentDayRangeUtc(today) };
    if (due === 'week') {
      return { dueAt: tashkentRangeUtc(today, addDaysToDateStr(today, 6)) };
    }
    return {};
  }

  async list(dto: ListTasksDto, actor: TaskActor) {
    const limit = dto.limit ?? 50;
    const and: Prisma.TaskWhereInput[] = [];
    const where: Prisma.TaskWhereInput = {
      companyId: actor.companyId,
      AND: and,
    };
    if (dto.view === 'my') {
      and.push({
        participants: { some: { userId: actor.userId, role: 'ASSIGNEE' } },
      });
    } else if (dto.view === 'created') {
      and.push({ authorId: actor.userId });
    } else {
      if (actor.scope.kind !== 'all' && highestRoleId(actor.roleIds) !== 2) {
        throw new ForbiddenException('«Barchasi» faqat rahbarlarga ochiq');
      }
      and.push(this.visibilityWhere(actor));
    }
    if (dto.status?.length) {
      and.push({ status: { in: dto.status as TaskStatus[] } });
    }
    if (dto.status?.some((s) => s === 'DONE' || s === 'CANCELLED')) {
      // Closed tasks are a recent window; the open statuses are not. A cancelled
      // task has no `closedAt` (spec keeps the two apart), so it is cut by `cancelledAt`.
      const since = new Date(Date.now() - (dto.closedDays ?? 14) * 864e5);
      and.push({
        OR: [
          { status: { notIn: ['DONE', 'CANCELLED'] } },
          { status: 'DONE', closedAt: { gte: since } },
          { status: 'CANCELLED', cancelledAt: { gte: since } },
        ],
      });
    }
    if (dto.assigneeId?.length) {
      and.push({
        participants: {
          some: { role: 'ASSIGNEE', userId: { in: dto.assigneeId } },
        },
      });
    }
    if (dto.authorId?.length) and.push({ authorId: { in: dto.authorId } });
    if (dto.branchId?.length) and.push({ branchId: { in: dto.branchId } });
    if (dto.priority?.length) {
      and.push({ priority: { in: dto.priority as TaskPriority[] } });
    }
    if (dto.due) and.push(this.dueWhere(dto.due));
    if (dto.q?.trim()) {
      and.push({ title: { contains: dto.q.trim(), mode: 'insensitive' } });
    }
    if (dto.entityType && dto.entityId) {
      and.push({ entityType: dto.entityType, entityId: dto.entityId });
    }
    const cursor = decodeCursor(dto.cursor);
    if (dto.cursor && !cursor) {
      throw new BadRequestException("Sahifa belgisi noto'g'ri");
    }
    if (cursor) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.task.findMany({
      where,
      select: TASK_CARD_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    // Separate copies collapse into one card for their author (spec §4.3) and
    // for a manager reading «all», whose totals count the WHOLE batch, not
    // just the copies on this page.
    let data: (TaskCard & { batch?: BatchInfo })[];
    if (dto.view === 'created' || dto.view === 'all') {
      const batchIds = [
        ...new Set(
          page.map((r) => r.batchId).filter((b): b is string => b !== null),
        ),
      ];
      data = collapseBatches(
        page.map(toTaskCard),
        await this.batchStats(batchIds, actor.companyId),
      );
    } else {
      data = page.map(toTaskCard);
    }
    return {
      data,
      nextCursor:
        rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  /** Every copy of each batch by status, whatever the list filters left on the page. */
  private async batchStats(
    batchIds: string[],
    companyId: number,
  ): Promise<Map<string, BatchInfo>> {
    const stats = new Map<string, BatchInfo>();
    if (batchIds.length === 0) return stats;
    const groups = await this.prisma.task.groupBy({
      by: ['batchId', 'status'],
      where: { companyId, batchId: { in: batchIds } },
      _count: { _all: true },
    });
    for (const g of groups) {
      if (g.batchId === null) continue;
      const s = stats.get(g.batchId) ?? { total: 0, done: 0, statuses: [] };
      s.total += g._count._all;
      if (g.status === 'DONE') s.done += g._count._all;
      for (let i = 0; i < g._count._all; i++) s.statuses.push(g.status);
      stats.set(g.batchId, s);
    }
    for (const s of stats.values()) {
      s.statuses.sort(
        (a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
      );
    }
    return stats;
  }

  async detail(id: string, actor: TaskActor, before?: string) {
    const beforeDate = before ? new Date(before) : null;
    if (beforeDate && Number.isNaN(beforeDate.getTime())) {
      throw new BadRequestException("Sana noto'g'ri");
    }
    const { row, access } = await this.tasks.loadForAccess(
      this.prisma,
      id,
      actor,
    );
    const events = await this.prisma.taskEvent.findMany({
      where: {
        taskId: id,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      select: TASK_EVENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    let batch: ReturnType<typeof toTaskCard>[] = [];
    if (row.batchId && (access.isAuthor || access.isManager)) {
      const rows = await this.prisma.task.findMany({
        where: { batchId: row.batchId, companyId: actor.companyId },
        select: TASK_CARD_SELECT,
        orderBy: { createdAt: 'asc' },
      });
      batch = rows.map(toTaskCard);
    }
    return {
      task: toTaskDetail(row),
      events: events.reverse(),
      access,
      batch,
    };
  }

  async counts(actor: TaskActor) {
    const now = new Date();
    const myWhere: Prisma.TaskWhereInput = {
      companyId: actor.companyId,
      status: { in: OPEN },
      participants: { some: { userId: actor.userId, role: 'ASSIGNEE' } },
    };
    const authoredOpen: Prisma.TaskWhereInput = {
      companyId: actor.companyId,
      authorId: actor.userId,
      status: { in: OPEN },
    };
    const [my, myOverdue, singles, openBatches, review] = await Promise.all([
      this.prisma.task.count({ where: myWhere }),
      this.prisma.task.count({ where: { ...myWhere, dueAt: { lt: now } } }),
      this.prisma.task.count({ where: { ...authoredOpen, batchId: null } }),
      // «Har biriga alohida» copies are one item for their author.
      this.prisma.task.findMany({
        where: { ...authoredOpen, batchId: { not: null } },
        distinct: ['batchId'],
        select: { batchId: true },
      }),
      this.prisma.task.count({
        where: {
          companyId: actor.companyId,
          authorId: actor.userId,
          status: 'IN_REVIEW',
        },
      }),
    ]);
    return {
      my,
      myOverdue,
      created: singles + openBatches.length,
      review,
    };
  }

  /** Spec §4.5: per assignee — open, overdue, done this month, on-time share. */
  async workload(dto: WorkloadQueryDto, actor: TaskActor) {
    const top = highestRoleId(actor.roleIds);
    if (actor.scope.kind !== 'all' && top !== 2) {
      throw new ForbiddenException('«Yuklama» faqat rahbarlarga ochiq');
    }
    const month = dto.month ?? tashkentMonthKey(new Date());
    const range = tashkentMonthRangeUtc(month);
    const branchIds =
      actor.scope.kind === 'all'
        ? dto.branchId
          ? [dto.branchId]
          : null
        : actor.scope.branchIds.filter(
            (b) => !dto.branchId || b === dto.branchId,
          );
    const scope: Prisma.TaskWhereInput = branchIds
      ? { branchId: { in: branchIds } }
      : {};
    const rows = await this.prisma.taskParticipant.findMany({
      where: {
        role: 'ASSIGNEE',
        task: {
          companyId: actor.companyId,
          ...scope,
          OR: [
            { status: { in: OPEN } },
            { status: 'DONE', closedAt: { gte: range.gte, lt: range.lt } },
          ],
        },
      },
      select: {
        userId: true,
        task: { select: { status: true, dueAt: true, closedAt: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
            roles: { select: { role: { select: { name: true } } } },
            branches: { select: { branch: { select: { name: true } } } },
          },
        },
      },
    });
    const now = new Date();
    const byUser = new Map<
      number,
      {
        user: (typeof rows)[number]['user'];
        open: number;
        overdue: number;
        done: number;
        onTime: number;
        withDue: number;
      }
    >();
    for (const r of rows) {
      const e = byUser.get(r.userId) ?? {
        user: r.user,
        open: 0,
        overdue: 0,
        done: 0,
        onTime: 0,
        withDue: 0,
      };
      if (r.task.status === 'DONE') {
        e.done++;
        if (r.task.dueAt && r.task.closedAt) {
          e.withDue++;
          if (r.task.closedAt <= r.task.dueAt) e.onTime++;
        }
      } else {
        e.open++;
        if (r.task.dueAt && r.task.dueAt < now) e.overdue++;
      }
      byUser.set(r.userId, e);
    }
    const entries = [...byUser.values()];
    const data = entries
      .map((e) => ({
        user: {
          id: e.user.id,
          firstName: e.user.firstName,
          lastName: e.user.lastName,
          photo: e.user.photo,
          roleNames: e.user.roles.map((x) => x.role.name),
          branchNames: e.user.branches.map((b) => b.branch.name),
        },
        open: e.open,
        overdue: e.overdue,
        doneThisMonth: e.done,
        onTimePercent: e.withDue
          ? Math.round((100 * e.onTime) / e.withDue)
          : null,
      }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    const totals = {
      open: data.reduce((s, d) => s + d.open, 0),
      overdue: data.reduce((s, d) => s + d.overdue, 0),
      doneThisMonth: data.reduce((s, d) => s + d.doneThisMonth, 0),
      // The company-wide on-time share is onTime / withDue; per-person shares cannot be averaged into it.
      onTime: entries.reduce((s, e) => s + e.onTime, 0),
      withDue: entries.reduce((s, e) => s + e.withDue, 0),
    };
    return { month, data, totals };
  }

  /** Whom the caller may pick (spec §4.6): ladder + branch, grouped by role on the client. */
  async assignable(actor: TaskActor) {
    const caller = this.tasks.actorPerson(actor);
    const ladder = assignableRoleIds(actor.roleIds);
    const where: Prisma.UserWhereInput = {
      companyId: actor.companyId,
      deletedAt: null,
      status: { in: [...SIGN_IN_USER_STATUSES] },
      roles: { some: { role: { id: { in: [1, 2, 3, 4, 5] } } } },
      ...(actor.scope.kind === 'all'
        ? {}
        : {
            OR: [
              {
                branches: { some: { branchId: { in: actor.scope.branchIds } } },
              },
              { mainBranch: { in: actor.scope.branchIds } },
              { id: actor.userId },
              // A CEO has no branch of their own by design, and is someone
              // anyone below may name as a watcher (`canWatch` decides).
              { roles: { some: { role: { id: 1 } } } },
            ],
          }),
    };
    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photo: true,
        telegramChatId: true,
        mainBranch: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
        branches: {
          select: { branchId: true, branch: { select: { name: true } } },
        },
      },
    });
    const shape = (u: (typeof users)[number]) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      photo: u.photo,
      roleNames: u.roles.map((r) => r.role.name),
      branchNames: u.branches.map((b) => b.branch.name),
      telegramLinked: u.telegramChatId !== null,
    });
    const assignees = users
      .filter((u) => canAssignTo(caller, toPolicyPerson(u)))
      .map(shape);
    const watchers = users
      .filter((u) => canWatch(caller, toPolicyPerson(u)))
      .map(shape);
    return { assignees, watchers, ladder };
  }
}

type BatchInfo = { total: number; done: number; statuses: TaskStatus[] };

/**
 * «Men bergan»: one card per batch. `batch` carries the totals of the WHOLE
 * batch (`stats`, counted over every copy, whatever the list filters left on
 * the page); the page's own copies only fill the card's assignee list. A batch
 * missing from `stats` falls back to the copies on the page.
 */
export function collapseBatches<
  T extends {
    batchId: string | null;
    status: TaskStatus;
    assignees: unknown[];
  },
>(
  cards: T[],
  stats: ReadonlyMap<string, BatchInfo>,
): (T & { batch?: BatchInfo })[] {
  const seen = new Map<string, T & { batch?: BatchInfo }>();
  const onPage = new Map<string, BatchInfo>();
  const out: (T & { batch?: BatchInfo })[] = [];
  for (const c of cards) {
    if (!c.batchId) {
      out.push(c);
      continue;
    }
    const local = onPage.get(c.batchId) ?? { total: 0, done: 0, statuses: [] };
    local.total++;
    local.statuses.push(c.status);
    if (c.status === 'DONE') local.done++;
    onPage.set(c.batchId, local);

    const head = seen.get(c.batchId);
    if (!head) {
      // Own copy of the list: the merge below must not write into the input.
      const h = { ...c, assignees: [...c.assignees] };
      seen.set(c.batchId, h);
      out.push(h);
    } else {
      head.assignees.push(...c.assignees);
    }
  }
  for (const [batchId, head] of seen) {
    head.batch = stats.get(batchId) ?? onPage.get(batchId);
  }
  return out;
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TaskStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import {
  resolveCallerBranchScope,
  type CallerBranchScope,
} from '../common/auth/branch-scope';
import { assertCallerMayTouchCommentEntity } from '../common/auth/comment-entity-scope';
import {
  whereUserMayAct,
  SIGN_IN_USER_STATUSES,
} from '../common/auth/blocked-user';
import { isCalendarDateStr } from '../common/date/tashkent';
import { isTransactionConflict } from '../common/transaction-conflict';
import {
  canAssignTo,
  canWatch,
  resolveAccess,
  type PolicyPerson,
  type TaskAccess,
} from './task-policy';
import { assertManualDueAt, defaultDueAt } from './task-due';
import {
  TASK_DETAIL_SELECT,
  toTaskDetail,
  type TaskDetail,
} from './task-select';
import { resolveTaskBranchId } from './task-branch';
import { TaskOutboxService } from './task-outbox.service';
import { TASK_EVENTS, type TaskEventTask } from './task-events';
import type { CreateTaskDto } from './dto/create-task.dto';

export interface TaskActor {
  userId: number;
  companyId: number;
  roleIds: number[];
  roleNames: string[];
  scope: CallerBranchScope;
  headerBranchId: number | null;
}

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  photo: true,
  telegramChatId: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
  branches: { select: { branchId: true } },
  mainBranch: true,
} as const;

export function toPolicyPerson(u: {
  id: number;
  roles: { role: { id: number } }[];
  branches: { branchId: number }[];
  mainBranch: number | null;
}): PolicyPerson {
  const roleIds = u.roles.map((r) => r.role.id);
  const branchIds = [
    ...new Set([
      ...u.branches.map((b) => b.branchId),
      ...(u.mainBranch ? [u.mainBranch] : []),
    ]),
  ];
  return {
    id: u.id,
    roleIds,
    branchIds: roleIds.includes(1) ? 'all' : branchIds,
  };
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;

/**
 * A bare `YYYY-MM-DD` day → 18:00 Tashkent; an ISO instant as is; empty → no due.
 * Anything else (a loose `Date.parse` string, a non-string) is a 400, never a
 * guess at which timezone was meant.
 */
export function parseDueInput(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException("Muddat noto'g'ri");
  }
  if (isCalendarDateStr(raw)) return defaultDueAt(raw);
  const d = new Date(raw);
  if (!ISO_INSTANT.test(raw) || Number.isNaN(d.getTime())) {
    throw new BadRequestException("Muddat noto'g'ri");
  }
  return d;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private holidays: HolidaysService,
    private outbox: TaskOutboxService,
  ) {}

  /** Roles and branches from the DATABASE (ADR-0028), never from the token. */
  async loadActor(
    userId: number,
    companyId: number,
    headerBranchId: number | null,
  ): Promise<TaskActor> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, companyId, ...whereUserMayAct() },
      select: {
        id: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    if (!u) throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    return {
      userId,
      companyId,
      roleIds: u.roles.map((r) => r.role.id),
      roleNames: u.roles.map((r) => r.role.name),
      scope,
      headerBranchId,
    };
  }

  actorPerson(actor: TaskActor): PolicyPerson {
    return {
      id: actor.userId,
      roleIds: actor.roleIds,
      branchIds: actor.scope.kind === 'all' ? 'all' : actor.scope.branchIds,
    };
  }

  /** Live staff of this company; missing ids are a 400. */
  async loadPeople(ids: number[], companyId: number) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        id: { in: unique },
        companyId,
        deletedAt: null,
        status: { in: [...SIGN_IN_USER_STATUSES] },
        roles: { some: { role: { id: { in: [1, 2, 3, 4, 5] } } } },
      },
      select: PERSON_SELECT,
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException(
        'Ijrochilardan biri topilmadi yoki faol emas',
      );
    }
    return rows;
  }

  private async holidaySet(branchId: number | null, around: Date) {
    const from = new Date(around.getTime() - 2 * 864e5);
    const to = new Date(around.getTime() + 2 * 864e5);
    return this.holidays.buildHolidayDateSet(from, to, branchId ?? undefined);
  }

  async create(dto: CreateTaskDto, actor: TaskActor): Promise<TaskDetail[]> {
    if (dto.entityType && dto.entityId) {
      await assertCallerMayTouchCommentEntity(
        this.prisma,
        actor.userId,
        actor.roleNames,
        dto.entityType,
        dto.entityId,
        actor.companyId,
      );
      // The generic entity guard does not scope a User by company.
      if (dto.entityType === 'User') {
        const linked = await this.prisma.user.findFirst({
          where: { id: Number(dto.entityId), companyId: actor.companyId },
          select: { id: true },
        });
        if (!linked) throw new NotFoundException('Xodim topilmadi');
      }
    }
    const branchId = await resolveTaskBranchId(this.prisma, {
      companyId: actor.companyId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      headerBranchId: actor.headerBranchId,
      callerScope: actor.scope,
    });
    const caller = this.actorPerson(actor);
    const assignees = await this.loadPeople(dto.assigneeIds, actor.companyId);
    const watchers = await this.loadPeople(
      dto.watcherIds ?? [],
      actor.companyId,
    );
    for (const u of assignees) {
      if (!canAssignTo(caller, toPolicyPerson(u))) {
        throw new ForbiddenException(
          `${u.firstName} ${u.lastName} ga topshiriq bera olmaysiz`,
        );
      }
    }
    for (const u of watchers) {
      if (!canWatch(caller, toPolicyPerson(u))) {
        throw new ForbiddenException(
          `${u.firstName} ${u.lastName} ni kuzatuvchi qila olmaysiz`,
        );
      }
    }
    const dueAt = parseDueInput(dto.dueAt);
    if (dueAt) assertManualDueAt(dueAt, await this.holidaySet(branchId, dueAt));

    const assigneeIdSet = new Set(assignees.map((a) => a.id));
    const watcherIds = watchers
      .map((w) => w.id)
      .filter((id) => !assigneeIdSet.has(id));
    const groups =
      dto.separateCopies && assignees.length > 1
        ? assignees.map((a) => [a.id])
        : [assignees.map((a) => a.id)];
    const batchId = groups.length > 1 ? randomUUID() : null;
    const steps = (dto.steps ?? []).map((s, i) => ({
      title: s.title.trim(),
      position: i,
    }));

    // All copies and their reminder rows commit together: a half-made batch
    // would leave the author with copies that were never assigned.
    const rows = await this.prisma.$transaction(async (tx) => {
      const made: { ids: number[]; row: TaskRow }[] = [];
      for (const ids of groups) {
        const row = await tx.task.create({
          data: {
            companyId: actor.companyId,
            branchId,
            kind: 'MANUAL',
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            priority: dto.priority ?? 'MEDIUM',
            dueAt,
            authorId: actor.userId,
            entityType: dto.entityType ?? null,
            entityId: dto.entityId ?? null,
            batchId,
            participants: {
              create: [
                ...ids.map((userId) => ({
                  userId,
                  role: 'ASSIGNEE' as const,
                })),
                ...watcherIds.map((userId) => ({
                  userId,
                  role: 'WATCHER' as const,
                })),
              ],
            },
            steps: { create: steps },
            events: {
              create: [{ type: 'CREATED', actorId: actor.userId, via: 'WEB' }],
            },
          },
          select: TASK_DETAIL_SELECT,
        });
        if (dueAt) await this.outbox.schedule(tx, row);
        made.push({ ids, row });
      }
      return made;
    });

    // Notifications go out only once the rows are committed.
    for (const { ids, row } of rows) {
      this.emitter.emit(TASK_EVENTS.ASSIGNED, {
        task: this.eventTask(row),
        actorId: actor.userId,
        userIds: ids,
      });
      if (watcherIds.length) {
        this.emitter.emit(TASK_EVENTS.ASSIGNED, {
          task: this.eventTask(row),
          actorId: actor.userId,
          userIds: watcherIds,
        });
      }
    }
    return rows.map(({ row }) => toTaskDetail(row));
  }

  eventTask(r: {
    id: string;
    companyId: number;
    title: string;
    kind: string;
    authorId: number | null;
    dueAt: Date | null;
    status: TaskStatus;
    participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
  }): TaskEventTask {
    return {
      id: r.id,
      companyId: r.companyId,
      title: r.title,
      kind: r.kind,
      authorId: r.authorId,
      dueAt: r.dueAt,
      status: r.status,
      participants: r.participants.map((p) => ({
        userId: p.userId,
        role: p.role,
      })),
    };
  }

  /** Loads a task the caller may see, with its access; 404 for an invisible one. */
  async loadForAccess(
    tx: Prisma.TransactionClient | PrismaService,
    id: string,
    actor: TaskActor,
  ) {
    const row = await tx.task.findFirst({
      where: { id, companyId: actor.companyId },
      select: TASK_DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Topshiriq topilmadi');
    const access: TaskAccess = resolveAccess(this.actorPerson(actor), {
      authorId: row.authorId,
      branchId: row.branchId,
      participants: row.participants.map((p) => ({
        userId: p.userId,
        role: p.role,
      })),
    });
    if (!access.canView) throw new NotFoundException('Topshiriq topilmadi');
    return { row, access };
  }

  async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      });
    } catch (err) {
      if (isTransactionConflict(err)) {
        throw new ConflictException(
          "Topshiriq hozirgina o'zgardi. Sahifani yangilang",
        );
      }
      throw err;
    }
  }
}

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

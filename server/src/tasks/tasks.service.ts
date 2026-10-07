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
  TASK_EVENT_SELECT,
  toTaskDetail,
  type TaskDetail,
} from './task-select';
import { resolveTaskBranchId } from './task-branch';
import { checkTransition, OPEN_STATUSES } from './task-transitions';
import { TaskOutboxService } from './task-outbox.service';
import { TASK_EVENTS, type TaskEventTask } from './task-events';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

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

/** An ISO instant: date, `T`, time and a zone (`Z` or `±hh:mm`). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/;

/**
 * A bare `YYYY-MM-DD` day → 18:00 Tashkent; an ISO instant as is; empty → no due.
 * Anything else (a loose `Date.parse` string, a time without a zone, a
 * non-string) is a 400: `new Date` would read a zone-less time in the PROCESS
 * timezone (UTC on Railway), i.e. guess which timezone was meant.
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

/** Trimmed text, or a 400: the DTOs trim too, but Telegram and other callers skip them. */
function requireText(raw: string, message: string): string {
  const text = raw.trim();
  if (!text) throw new BadRequestException(message);
  return text;
}

/** First assignee to act takes a system task; the other copies go (ADR-0054). */
export async function claimSystemTask(
  tx: Prisma.TransactionClient,
  taskId: string,
  userId: number,
): Promise<boolean> {
  const rows = await tx.taskParticipant.findMany({
    where: { taskId, role: 'ASSIGNEE' },
    select: { userId: true },
  });
  if (!rows.some((r) => r.userId === userId)) return false;
  // Lesson row first (lock order), same as before the move.
  await tx.unmarkedLesson.updateMany({
    where: { taskId },
    data: { claimedById: userId },
  });
  await tx.task.update({
    where: { id: taskId },
    data: { claimedById: userId },
  });
  if (rows.length > 1) {
    await tx.taskParticipant.deleteMany({
      where: { taskId, role: 'ASSIGNEE', userId: { not: userId } },
    });
  }
  return true;
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

  /** Live staff of this company; missing ids are a 400 carrying `missingMessage`. */
  async loadPeople(
    ids: number[],
    companyId: number,
    missingMessage = 'Ijrochilardan biri topilmadi yoki faol emas',
  ) {
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
      throw new BadRequestException(missingMessage);
    }
    return rows;
  }

  /**
   * Live staff for both lists, each inside the caller's reach. No name in the
   * refusal: it must not tell the caller who someone outside their ladder is.
   */
  private async loadAndCheckPeople(
    assigneeIds: number[],
    watcherIds: number[],
    actor: TaskActor,
  ) {
    const caller = this.actorPerson(actor);
    const assignees = await this.loadPeople(assigneeIds, actor.companyId);
    const watchers = await this.loadPeople(
      watcherIds,
      actor.companyId,
      'Kuzatuvchilardan biri topilmadi yoki faol emas',
    );
    if (!assignees.every((u) => canAssignTo(caller, toPolicyPerson(u)))) {
      throw new ForbiddenException('Bu xodimga topshiriq bera olmaysiz');
    }
    if (!watchers.every((u) => canWatch(caller, toPolicyPerson(u)))) {
      throw new ForbiddenException('Bu xodimni kuzatuvchi qila olmaysiz');
    }
    return { assignees, watchers };
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
    const { assignees, watchers } = await this.loadAndCheckPeople(
      dto.assigneeIds,
      dto.watcherIds ?? [],
      actor,
    );
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
    const rows = await this.prisma.$transaction(
      async (tx) => {
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
                create: [
                  { type: 'CREATED', actorId: actor.userId, via: 'WEB' },
                ],
              },
            },
            select: TASK_DETAIL_SELECT,
          });
          if (dueAt) await this.outbox.schedule(tx, row);
          made.push({ ids, row });
        }
        return made;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

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

  // ---------- status ----------

  async changeStatus(
    id: string,
    to: Exclude<TaskStatus, 'CANCELLED'>,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const { from, updated } = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canWork) {
        throw new ForbiddenException('Bu topshiriqda siz ijrochi emassiz');
      }
      // An author who is also the only assignee acts as the assignee, so their
      // own task goes straight to DONE.
      const by = access.isAssignee ? 'ASSIGNEE' : 'MANAGER';
      const assignees = row.participants.filter((p) => p.role === 'ASSIGNEE');
      const selfTask =
        assignees.length === 1 &&
        assignees[0].userId === row.authorId &&
        row.authorId === actor.userId;
      const verdict = checkTransition({
        from: row.status,
        to,
        by,
        selfTask,
        kind: row.kind,
        requiresPhoto: row.requiresPhoto,
        // No photo upload in this phase: a task that requires one cannot go to review.
        hasFreshPhoto: false,
      });
      if (!verdict.ok) throw new BadRequestException(verdict.message);

      // The first assignee to act takes a system task (claimSystemTask also
      // writes `claimedById` and drops the other assignees).
      if (
        row.kind !== 'MANUAL' &&
        access.isAssignee &&
        row.claimedById === null
      ) {
        await claimSystemTask(tx, id, actor.userId);
      }
      const now = new Date();
      const data: Prisma.TaskUncheckedUpdateInput = { status: to };
      if (to === 'IN_PROGRESS' && !row.startedAt) data.startedAt = now;
      if (to === 'IN_REVIEW') data.reviewRequestedAt = now;
      if (to === 'DONE') data.closedAt = now;
      const updated = await tx.task.update({
        where: { id },
        data,
        select: TASK_DETAIL_SELECT,
      });
      await tx.taskEvent.create({
        data: {
          taskId: id,
          type: 'STATUS',
          actorId: actor.userId,
          meta: { from: row.status, to },
          via: 'WEB',
        },
      });
      await tx.taskParticipant.updateMany({
        where: { taskId: id, userId: actor.userId, seenAt: null },
        data: { seenAt: now },
      });
      if (to === 'DONE') {
        await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      }
      return { from: row.status, updated };
    });
    const task = this.eventTask(updated);
    this.emitter.emit(TASK_EVENTS.STATUS_CHANGED, {
      task,
      actorId: actor.userId,
      from,
      to,
    });
    if (to === 'IN_REVIEW') {
      this.emitter.emit(TASK_EVENTS.REVIEW_REQUESTED, {
        task,
        actorId: actor.userId,
      });
    }
    return toTaskDetail(updated);
  }

  async review(
    id: string,
    action: 'ACCEPT' | 'RETURN',
    reason: string | undefined,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const trimmed = reason?.trim() ?? '';
    if (action === 'RETURN' && !trimmed) {
      throw new BadRequestException('Qaytarish sababini yozing');
    }
    const updated = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) {
        throw new ForbiddenException('Faqat beruvchi tekshira oladi');
      }
      const to: TaskStatus = action === 'ACCEPT' ? 'DONE' : 'IN_PROGRESS';
      const verdict = checkTransition({
        from: row.status,
        to,
        by: 'MANAGER',
        selfTask: false,
        kind: row.kind,
        requiresPhoto: row.requiresPhoto,
        hasFreshPhoto: true,
      });
      if (!verdict.ok) throw new BadRequestException(verdict.message);
      const now = new Date();
      const data: Prisma.TaskUncheckedUpdateInput =
        action === 'ACCEPT'
          ? { status: 'DONE', closedAt: now }
          : {
              status: 'IN_PROGRESS',
              returnedCount: { increment: 1 },
              lastReturnedAt: now,
            };
      const u = await tx.task.update({
        where: { id },
        data,
        select: TASK_DETAIL_SELECT,
      });
      await tx.taskEvent.create({
        data: {
          taskId: id,
          type: action === 'ACCEPT' ? 'STATUS' : 'RETURN',
          actorId: actor.userId,
          text: action === 'RETURN' ? trimmed : null,
          meta: { from: row.status, to },
          via: 'WEB',
        },
      });
      if (action === 'ACCEPT') {
        await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      }
      return u;
    });
    this.emitter.emit(TASK_EVENTS.REVIEWED, {
      task: this.eventTask(updated),
      actorId: actor.userId,
      accepted: action === 'ACCEPT',
      reason: action === 'RETURN' ? trimmed : null,
    });
    return toTaskDetail(updated);
  }

  async cancel(
    id: string,
    reason: string | undefined,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const text = reason?.trim() || null;
    const updated = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) {
        throw new ForbiddenException('Faqat beruvchi bekor qila oladi');
      }
      const verdict = checkTransition({
        from: row.status,
        to: 'CANCELLED',
        by: 'MANAGER',
        selfTask: false,
        kind: row.kind,
        requiresPhoto: false,
        hasFreshPhoto: true,
      });
      if (!verdict.ok) throw new BadRequestException(verdict.message);
      const u = await tx.task.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: text,
        },
        select: TASK_DETAIL_SELECT,
      });
      await tx.taskEvent.create({
        data: {
          taskId: id,
          type: 'CANCELLED',
          actorId: actor.userId,
          text,
          via: 'WEB',
        },
      });
      await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      return u;
    });
    this.emitter.emit(TASK_EVENTS.CANCELLED, {
      task: this.eventTask(updated),
      actorId: actor.userId,
      reason: text,
    });
    return toTaskDetail(updated);
  }

  /** A fresh NEW copy by the actor; `create` runs the ladder checks again. */
  async duplicate(id: string, actor: TaskActor): Promise<TaskDetail> {
    const { row } = await this.loadForAccess(this.prisma, id, actor);
    if (row.kind !== 'MANUAL') {
      throw new BadRequestException("Tizim topshirig'idan nusxa olinmaydi");
    }
    const idsOf = (role: 'ASSIGNEE' | 'WATCHER') =>
      row.participants.filter((p) => p.role === role).map((p) => p.userId);
    const [copy] = await this.create(
      {
        title: row.title,
        description: row.description ?? undefined,
        assigneeIds: idsOf('ASSIGNEE'),
        watcherIds: idsOf('WATCHER'),
        priority: row.priority,
        entityType: row.entityType ?? undefined,
        entityId: row.entityId ?? undefined,
        steps: row.steps.map((s) => ({ title: s.title })),
      },
      actor,
    );
    return copy;
  }

  // ---------- participants ----------

  async setParticipants(
    id: string,
    assigneeIds: number[],
    watcherIds: number[],
    actor: TaskActor,
  ): Promise<TaskDetail> {
    if (assigneeIds.length === 0) {
      throw new BadRequestException('Kamida bitta ijrochi kerak');
    }
    await this.loadAndCheckPeople(assigneeIds, watcherIds, actor);
    const assigneeSet = new Set(assigneeIds);
    const wanted = new Map<number, 'ASSIGNEE' | 'WATCHER'>([
      ...[...assigneeSet].map((u) => [u, 'ASSIGNEE'] as const),
      ...[...new Set(watcherIds)]
        .filter((w) => !assigneeSet.has(w))
        .map((u) => [u, 'WATCHER'] as const),
    ]);

    const r = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) {
        throw new ForbiddenException(
          "Ijrochilarni faqat beruvchi o'zgartiradi",
        );
      }
      if (row.kind !== 'MANUAL') {
        throw new BadRequestException(
          "Tizim topshirig'ining ijrochisi o'zgartirilmaydi",
        );
      }
      if (!OPEN_STATUSES.includes(row.status)) {
        throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
      }
      const was = new Map(row.participants.map((p) => [p.userId, p.role]));
      const removed = [...was.keys()].filter((u) => !wanted.has(u));
      // New people and people whose role flipped (assignee ↔ watcher).
      const added = [...wanted].filter(([u, role]) => was.get(u) !== role);
      if (!added.length && !removed.length) {
        return { updated: row, added: [], removed: [] };
      }

      if (removed.length) {
        await tx.taskParticipant.deleteMany({
          where: { taskId: id, userId: { in: removed } },
        });
        await tx.taskOutbox.deleteMany({
          where: { taskId: id, userId: { in: removed }, sentAt: null },
        });
      }
      for (const role of ['ASSIGNEE', 'WATCHER'] as const) {
        const flipped = added
          .filter(([u, to]) => to === role && was.has(u))
          .map(([u]) => u);
        if (flipped.length) {
          await tx.taskParticipant.updateMany({
            where: { taskId: id, userId: { in: flipped } },
            data: { role },
          });
        }
      }
      const fresh = added.filter(([u]) => !was.has(u));
      if (fresh.length) {
        await tx.taskParticipant.createMany({
          data: fresh.map(([userId, role]) => ({ taskId: id, userId, role })),
          skipDuplicates: true,
        });
      }
      const addedIds = added.map(([u]) => u);
      await tx.taskEvent.create({
        data: {
          taskId: id,
          type: 'ASSIGNEE',
          actorId: actor.userId,
          meta: { added: addedIds, removed },
          via: 'WEB',
        },
      });
      const updated = await tx.task.findFirst({
        where: { id },
        select: TASK_DETAIL_SELECT,
      });
      if (!updated) throw new NotFoundException('Topshiriq topilmadi');
      if (updated.dueAt) await this.outbox.schedule(tx, updated);
      return { updated, added: addedIds, removed };
    });
    const task = this.eventTask(r.updated);
    if (r.added.length) {
      this.emitter.emit(TASK_EVENTS.ASSIGNED, {
        task,
        actorId: actor.userId,
        userIds: r.added,
      });
    }
    if (r.removed.length) {
      this.emitter.emit(TASK_EVENTS.UNASSIGNED, {
        task,
        actorId: actor.userId,
        userIds: r.removed,
      });
    }
    return toTaskDetail(r.updated);
  }

  async markSeen(id: string, actor: TaskActor): Promise<void> {
    await this.loadForAccess(this.prisma, id, actor);
    await this.prisma.taskParticipant.updateMany({
      where: { taskId: id, userId: actor.userId, seenAt: null },
      data: { seenAt: new Date() },
    });
  }

  // ---------- steps ----------

  async addStep(
    id: string,
    title: string,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const text = requireText(title, 'Qadam nomini yozing');
    await this.runSerializable(async (tx) => {
      const { access } = await this.loadForAccess(tx, id, actor);
      if (!access.canWork) {
        throw new ForbiddenException(
          "Qadam qo'shish uchun ijrochi yoki beruvchi bo'lish kerak",
        );
      }
      const max = await tx.taskStep.aggregate({
        where: { taskId: id },
        _max: { position: true },
      });
      await tx.taskStep.create({
        data: {
          taskId: id,
          title: text,
          position: (max._max.position ?? -1) + 1,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: id,
          type: 'STEP',
          actorId: actor.userId,
          meta: { action: 'added', title: text },
          via: 'WEB',
        },
      });
    });
    return this.reload(id, actor);
  }

  async updateStep(
    id: string,
    stepId: string,
    patch: { title?: string; done?: boolean },
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const title =
      patch.title === undefined
        ? undefined
        : requireText(patch.title, 'Qadam nomini yozing');
    await this.runSerializable(async (tx) => {
      const { access } = await this.loadForAccess(tx, id, actor);
      if (title !== undefined && !access.canManage) {
        throw new ForbiddenException(
          "Qadam nomini faqat beruvchi o'zgartiradi",
        );
      }
      if (patch.done !== undefined && !access.canWork) {
        throw new ForbiddenException(
          'Qadamni ijrochi yoki beruvchi belgilaydi',
        );
      }
      // Scoped by the task: a step id of another task is not found.
      const step = await tx.taskStep.findFirst({
        where: { id: stepId, taskId: id },
      });
      if (!step) throw new NotFoundException('Qadam topilmadi');
      const data: Prisma.TaskStepUncheckedUpdateInput = {};
      if (title !== undefined) data.title = title;
      if (patch.done !== undefined) {
        data.doneAt = patch.done ? new Date() : null;
        data.doneById = patch.done ? actor.userId : null;
      }
      await tx.taskStep.update({ where: { id: stepId }, data });
      if (patch.done !== undefined) {
        await tx.taskEvent.create({
          data: {
            taskId: id,
            type: 'STEP',
            actorId: actor.userId,
            meta: {
              action: patch.done ? 'done' : 'undone',
              title: title ?? step.title,
            },
            via: 'WEB',
          },
        });
      }
    });
    return this.reload(id, actor);
  }

  async deleteStep(
    id: string,
    stepId: string,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const { access } = await this.loadForAccess(this.prisma, id, actor);
    if (!access.canManage) {
      throw new ForbiddenException("Qadamni faqat beruvchi o'chiradi");
    }
    const step = await this.prisma.taskStep.findFirst({
      where: { id: stepId, taskId: id },
    });
    if (!step) throw new NotFoundException('Qadam topilmadi');
    await this.prisma.taskStep.delete({ where: { id: stepId } });
    return this.reload(id, actor);
  }

  // ---------- discussion ----------

  async addComment(
    id: string,
    text: string,
    actor: TaskActor,
  ): Promise<TaskEventRow> {
    const body = requireText(text, 'Izoh matnini yozing');
    // `loadForAccess` already answered 404 to anyone who cannot view the task.
    const { row } = await this.loadForAccess(this.prisma, id, actor);
    const ev = await this.prisma.taskEvent.create({
      data: {
        taskId: id,
        type: 'COMMENT',
        actorId: actor.userId,
        text: body,
        via: 'WEB',
      },
      select: TASK_EVENT_SELECT,
    });
    this.emitter.emit(TASK_EVENTS.COMMENTED, {
      task: this.eventTask(row),
      actorId: actor.userId,
      text: body,
    });
    return ev;
  }

  // ---------- fields ----------

  async update(
    id: string,
    dto: UpdateTaskDto,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const { updated, dueChanged } = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) {
        throw new ForbiddenException("Faqat beruvchi o'zgartira oladi");
      }
      if (row.kind !== 'MANUAL') {
        throw new BadRequestException("Tizim topshirig'i tahrirlanmaydi");
      }
      if (!OPEN_STATUSES.includes(row.status)) {
        throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
      }
      const data: Prisma.TaskUncheckedUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.description !== undefined) {
        data.description = dto.description?.trim() || null;
      }
      if (dto.priority !== undefined) data.priority = dto.priority;
      let dueChanged = false;
      if (dto.dueAt !== undefined) {
        const dueAt = parseDueInput(dto.dueAt);
        if (dueAt) {
          assertManualDueAt(dueAt, await this.holidaySet(row.branchId, dueAt));
        }
        data.dueAt = dueAt;
        dueChanged =
          (dueAt?.getTime() ?? null) !== (row.dueAt?.getTime() ?? null);
      }
      const updated = await tx.task.update({
        where: { id },
        data,
        select: TASK_DETAIL_SELECT,
      });
      if (dueChanged) {
        // The old reminders are for the old due date.
        await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
        if (updated.dueAt) await this.outbox.schedule(tx, updated);
      }
      return { updated, dueChanged };
    });
    if (dueChanged) {
      this.emitter.emit(TASK_EVENTS.DUE_CHANGED, {
        task: this.eventTask(updated),
        actorId: actor.userId,
      });
    }
    return toTaskDetail(updated);
  }

  private async reload(id: string, actor: TaskActor): Promise<TaskDetail> {
    const { row } = await this.loadForAccess(this.prisma, id, actor);
    return toTaskDetail(row);
  }
}

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;
export type TaskEventRow = Prisma.TaskEventGetPayload<{
  select: typeof TASK_EVENT_SELECT;
}>;

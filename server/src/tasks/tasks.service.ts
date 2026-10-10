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
import { whereUserMayAct } from '../common/auth/blocked-user';
import { isTransactionConflict } from '../common/transaction-conflict';
import {
  resolveAccess,
  type PolicyPerson,
  type TaskAccess,
} from './task-policy';
import { assertManualDueAt } from './task-due';
import {
  TASK_DETAIL_SELECT,
  TASK_EVENT_SELECT,
  toTaskDetail,
  type TaskCtx,
  type TaskDetail,
  type TaskEventRow,
  type TaskRow,
} from './task-select';
import { resolveTaskBranchId } from './task-branch';
import {
  REVIEW_REASON_MAX,
  REVIEW_REASON_TOO_LONG,
  parseDueInput,
  requireText,
} from './task-input';
import { loadAndCheckPeople, loadPeople } from './task-people';
import { cancelTx, changeStatusTx, reviewTx } from './task-status-writes';
import { addStepTx, deleteStepTx, updateStepTx } from './task-step-writes';
import { setParticipantsTx, updateFieldsTx } from './task-edit-writes';
import { TaskOutboxService } from './task-outbox.service';
import { TASK_EVENTS, toEventTask, type TaskEventTask } from './task-events';
import { assertMayLinkEntity, createCopiesTx } from './task-create';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

// Callers import these from here; the code lives in focused files.
export { claimSystemTask } from './task-claim';
export { parseDueInput } from './task-input';
export { toPolicyPerson } from './task-people';
export type { TaskEventRow } from './task-select';

export interface TaskActor {
  userId: number;
  companyId: number;
  roleIds: number[];
  roleNames: string[];
  scope: CallerBranchScope;
  headerBranchId: number | null;
  /** Where the action came from; the task's history records it. Unset = WEB. */
  via?: 'WEB' | 'TELEGRAM';
}

/** The one door to tasks: owns the transaction and the events (emitted after the commit). */
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
  loadPeople(ids: number[], companyId: number, missingMessage?: string) {
    return loadPeople(this.prisma, ids, companyId, missingMessage);
  }

  /** Both lists live and inside the caller's reach (403 otherwise, no names). */
  private checkPeople(
    assigneeIds: number[],
    watcherIds: number[],
    actor: TaskActor,
  ) {
    return loadAndCheckPeople(
      this.prisma,
      this.actorPerson(actor),
      actor.companyId,
      assigneeIds,
      watcherIds,
    );
  }

  private async holidaySet(branchId: number | null, around: Date) {
    const from = new Date(around.getTime() - 2 * 864e5);
    const to = new Date(around.getTime() + 2 * 864e5);
    return this.holidays.buildHolidayDateSet(from, to, branchId ?? undefined);
  }

  async create(dto: CreateTaskDto, actor: TaskActor): Promise<TaskDetail[]> {
    await assertMayLinkEntity(this.prisma, actor, dto);
    const branchId = await resolveTaskBranchId(this.prisma, {
      companyId: actor.companyId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      headerBranchId: actor.headerBranchId,
      callerScope: actor.scope,
    });
    const { assignees, watchers } = await this.checkPeople(
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

    // All copies and their reminder rows commit together: a half-made batch
    // would leave the author with copies that were never assigned.
    const rows = await this.prisma.$transaction(
      (tx) =>
        createCopiesTx(
          tx,
          {
            companyId: actor.companyId,
            branchId,
            authorId: actor.userId,
            dto,
            dueAt,
            batchId,
            watcherIds,
          },
          groups,
          this.schedule,
        ),
      { maxWait: 10_000, timeout: 15_000 },
    );

    // Notifications go out only once the rows are committed.
    for (const { ids, row } of rows) {
      this.emitter.emit(TASK_EVENTS.ASSIGNED, {
        task: this.eventTask(row),
        actorId: actor.userId,
        userIds: ids,
        created: true,
      });
      if (watcherIds.length) {
        this.emitter.emit(TASK_EVENTS.ASSIGNED, {
          task: this.eventTask(row),
          actorId: actor.userId,
          userIds: watcherIds,
          created: true,
        });
      }
    }
    return rows.map(({ row }) => toTaskDetail(row));
  }

  eventTask(r: Parameters<typeof toEventTask>[0]): TaskEventTask {
    return toEventTask(r);
  }

  /** Loads a task the caller may see, with its access; 404 for an invisible one. */
  async loadForAccess(
    tx: Prisma.TransactionClient | PrismaService,
    id: string,
    actor: TaskActor,
  ): Promise<TaskCtx> {
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

  /** One serializable transaction over a task the caller may see. */
  private inTask<T>(
    id: string,
    actor: TaskActor,
    fn: (tx: Prisma.TransactionClient, ctx: TaskCtx) => Promise<T>,
  ): Promise<T> {
    return this.runSerializable(async (tx) =>
      fn(tx, await this.loadForAccess(tx, id, actor)),
    );
  }

  private schedule = (tx: Prisma.TransactionClient, task: TaskRow) =>
    this.outbox.schedule(tx, task);

  // ---------- status ----------

  async changeStatus(
    id: string,
    to: Exclude<TaskStatus, 'CANCELLED'>,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    const { from, updated } = await this.inTask(id, actor, (tx, ctx) =>
      changeStatusTx(tx, ctx, to, actor.userId, actor.via),
    );
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
    // The web DTO says the same; Telegram skips the DTO.
    if (trimmed.length > REVIEW_REASON_MAX) {
      throw new BadRequestException(REVIEW_REASON_TOO_LONG);
    }
    const updated = await this.inTask(id, actor, (tx, ctx) =>
      reviewTx(tx, ctx, action, trimmed, actor.userId, actor.via),
    );
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
    const updated = await this.inTask(id, actor, (tx, ctx) =>
      cancelTx(tx, ctx, text, actor.userId),
    );
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
    // The task first: whoever cannot see it gets the 404, and cannot use the
    // people checks below to probe which ids exist.
    const first = await this.loadForAccess(this.prisma, id, actor);
    if (!first.access.canManage) {
      throw new ForbiddenException("Ijrochilarni faqat beruvchi o'zgartiradi");
    }
    await this.checkPeople(assigneeIds, watcherIds, actor);
    const r = await this.inTask(id, actor, (tx, ctx) =>
      setParticipantsTx(
        tx,
        ctx,
        assigneeIds,
        watcherIds,
        actor.userId,
        this.schedule,
      ),
    );
    const task = this.eventTask(r.updated);
    // Two plain emits, not a loop over the event names: `event-wiring.spec.ts`
    // reads the name at the call site and skips a variable.
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
        removedAssigneeIds: r.removedAssignees,
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
    await this.inTask(id, actor, (tx, ctx) =>
      addStepTx(tx, ctx, text, actor.userId),
    );
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
    await this.inTask(id, actor, (tx, ctx) =>
      updateStepTx(
        tx,
        ctx,
        stepId,
        { title, done: patch.done },
        actor.userId,
        actor.via,
      ),
    );
    return this.reload(id, actor);
  }

  async deleteStep(
    id: string,
    stepId: string,
    actor: TaskActor,
  ): Promise<TaskDetail> {
    await this.inTask(id, actor, (tx, ctx) =>
      deleteStepTx(tx, ctx, stepId, actor.userId),
    );
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
        via: actor.via ?? 'WEB',
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
    const dueAt =
      dto.dueAt === undefined ? undefined : parseDueInput(dto.dueAt);
    // The holiday lookup is a read of its own: it runs before the transaction.
    let holidays: ReadonlySet<string> = new Set();
    if (dueAt) {
      const { row } = await this.loadForAccess(this.prisma, id, actor);
      holidays = await this.holidaySet(row.branchId, dueAt);
    }
    const { updated, dueChanged } = await this.inTask(id, actor, (tx, ctx) =>
      updateFieldsTx(tx, ctx, dto, dueAt, holidays, this.schedule),
    );
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

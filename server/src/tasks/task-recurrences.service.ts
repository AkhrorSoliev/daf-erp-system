import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { batchIdFor, createCopiesTx, emitTaskCreated } from './task-create';
import { scheduleTaskOutbox } from './task-outbox.service';
import { loadAndCheckPeople } from './task-people';
import { highestRoleId, ROLE_ID } from './task-policy';
import {
  loadRecurrenceView,
  RECURRENCE_VIEW_SELECT,
  recurrenceCanManage,
  toRecurrenceViews,
  type RecurrenceView,
} from './task-recurrence-view';
import {
  firstRunDate,
  nextRunDateAfter,
  normalizeSchedule,
  recurrenceDueAt,
  recurrenceHolidays,
} from './task-recurrence-rules';
import { toTaskDetail, type TaskDetail } from './task-select';
import { TasksService, type TaskActor } from './tasks.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskRecurrenceDto } from './dto/task-recurrence.dto';

/** A rule does not carry «Rasm bilan tasdiqlansin» (ADR-0086). */
export const RECURRING_PHOTO_MESSAGE =
  "Takrorlanuvchi topshiriqda rasm bilan tasdiqlash yo'q";

/**
 * Recurring tasks (spec 2026-10-07 §3.6, ADR-0084): the rule's HTTP side.
 * The 07:00 run is `TaskRecurrenceRunner`.
 */
@Injectable()
export class TaskRecurrencesService {
  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private tasks: TasksService,
  ) {}

  /**
   * The 07:00 run keeps only live, active staff, so a rule is made only for
   * them: otherwise it would be saved and then never produce a task.
   */
  private async assertAssigneesActive(
    assigneeIds: number[],
    companyId: number,
  ): Promise<void> {
    const active = await this.prisma.user.count({
      where: {
        id: { in: assigneeIds },
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
    });
    if (active !== assigneeIds.length) {
      throw new BadRequestException(
        'Takrorlanuvchi topshiriq faqat faol xodimga beriladi',
      );
    }
  }

  /**
   * The rule and its first task(s) in one transaction: the same checks and
   * writer as a one-off create (`prepareCreate`, `createCopiesTx`), due on
   * the first run day whose time is still ahead; `nextRunDate` is the run
   * after that one.
   */
  async create(
    dto: CreateTaskDto,
    actor: TaskActor,
    now = new Date(),
  ): Promise<TaskDetail[]> {
    if (!dto.recurrence) {
      throw new BadRequestException('Takrorlanish berilmagan');
    }
    if (dto.dueAt) {
      throw new BadRequestException(
        "Takrorlanuvchi topshiriqqa sana qo'yilmaydi: vaqtini «Takrorlash» da tanlang",
      );
    }
    if (dto.requiresPhoto)
      throw new BadRequestException(RECURRING_PHOTO_MESSAGE);
    const schedule = normalizeSchedule(dto.recurrence);
    const p = await this.tasks.prepareCreate(dto, actor);
    await this.assertAssigneesActive(p.assigneeIds, actor.companyId);
    const holidays = await recurrenceHolidays(
      this.prisma,
      p.branchId,
      tashkentDateStr(now),
    );
    const first = firstRunDate(schedule, now, holidays);
    const next = nextRunDateAfter(schedule, first, holidays);
    const rows = await this.prisma.$transaction(
      async (tx) => {
        const rule = await tx.taskRecurrence.create({
          data: {
            companyId: actor.companyId,
            branchId: p.branchId,
            authorId: actor.userId,
            ...schedule,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            priority: dto.priority ?? 'MEDIUM',
            assigneeIds: p.assigneeIds,
            watcherIds: p.watcherIds,
            steps: (dto.steps ?? []).map((s) => s.title.trim()),
            entityType: dto.entityType ?? null,
            entityId: dto.entityId ?? null,
            separateCopies: dto.separateCopies === true,
            nextRunDate: utcMidnightFromDateStr(next),
          },
          select: { id: true },
        });
        return createCopiesTx(
          tx,
          {
            companyId: actor.companyId,
            branchId: p.branchId,
            authorId: actor.userId,
            dto,
            dueAt: recurrenceDueAt(first, schedule.dueTime),
            batchId: batchIdFor(p.groups),
            watcherIds: p.watcherIds,
            recurrenceId: rule.id,
          },
          p.groups,
          scheduleTaskOutbox,
        );
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    emitTaskCreated(this.emitter, rows, actor.userId, p.watcherIds);
    return rows.map(({ row }) => toTaskDetail(row));
  }

  /** CEO: the company; Branch Director: own + their branches'; anyone else: own. */
  private visibleWhere(actor: TaskActor): Prisma.TaskRecurrenceWhereInput {
    const base = { companyId: actor.companyId };
    if (actor.scope.kind === 'all') return base;
    if (
      highestRoleId(actor.roleIds) === ROLE_ID.BRANCH_DIRECTOR &&
      actor.scope.branchIds.length
    ) {
      return {
        ...base,
        OR: [
          { authorId: actor.userId },
          { branchId: { in: actor.scope.branchIds } },
        ],
      };
    }
    return { ...base, authorId: actor.userId };
  }

  async list(actor: TaskActor): Promise<{ data: RecurrenceView[] }> {
    // ponytail: 200 rules a list; page it when someone has more.
    const rows = await this.prisma.taskRecurrence.findMany({
      where: this.visibleWhere(actor),
      select: RECURRENCE_VIEW_SELECT,
      orderBy: [{ active: 'desc' }, { nextRunDate: 'asc' }],
      take: 200,
    });
    return {
      data: await toRecurrenceViews(
        this.prisma,
        rows,
        this.tasks.actorPerson(actor),
      ),
    };
  }

  /** 404 for an unknown rule and for one the caller may not manage: no leak. */
  private async manageable(id: string, actor: TaskActor) {
    const rule = await this.prisma.taskRecurrence.findFirst({
      where: { id, companyId: actor.companyId },
      select: {
        id: true,
        branchId: true,
        authorId: true,
        active: true,
        freq: true,
        weekdays: true,
        dayOfMonth: true,
        dueTime: true,
        watcherIds: true,
      },
    });
    if (!rule || !recurrenceCanManage(this.tasks.actorPerson(actor), rule)) {
      throw new NotFoundException('Takrorlanish topilmadi');
    }
    return rule;
  }

  /**
   * New assignees must be inside the caller's reach AND the author's: the
   * 07:00 run makes the tasks with the author's rights, so an assignee only
   * the caller may reach would be dropped there, silently.
   */
  private async checkNewAssignees(
    ids: number[],
    rule: { authorId: number },
    actor: TaskActor,
  ): Promise<number[]> {
    const { assignees } = await loadAndCheckPeople(
      this.prisma,
      this.tasks.actorPerson(actor),
      actor.companyId,
      ids,
      [],
    );
    const live = assignees.map((a) => a.id);
    if (rule.authorId !== actor.userId) {
      const author = await this.tasks.loadActor(
        rule.authorId,
        actor.companyId,
        null,
      );
      await loadAndCheckPeople(
        this.prisma,
        this.tasks.actorPerson(author),
        actor.companyId,
        live,
        [],
      );
    }
    await this.assertAssigneesActive(live, actor.companyId);
    return live;
  }

  /**
   * Stop / resume, a new schedule, new assignees (ADR-0084). A new schedule or
   * a resume starts tomorrow: today's task, if any, is already out. Assignees
   * alone leave the next run date as it is.
   */
  async update(
    id: string,
    dto: UpdateTaskRecurrenceDto,
    actor: TaskActor,
    now = new Date(),
  ): Promise<RecurrenceView> {
    const rule = await this.manageable(id, actor);
    const data: Prisma.TaskRecurrenceUpdateInput = {};
    if (dto.active !== undefined) data.active = dto.active;
    let schedule = {
      freq: rule.freq,
      weekdays: rule.weekdays,
      dayOfMonth: rule.dayOfMonth,
      dueTime: rule.dueTime,
    };
    if (dto.schedule) {
      schedule = normalizeSchedule(dto.schedule);
      Object.assign(data, schedule);
    }
    if (dto.assigneeIds) {
      const ids = await this.checkNewAssignees(dto.assigneeIds, rule, actor);
      data.assigneeIds = ids;
      data.watcherIds = rule.watcherIds.filter((w) => !ids.includes(w));
    }
    // Only a real resume moves the date: "active" on a running rule is a no-op.
    if (dto.schedule || (dto.active === true && !rule.active)) {
      const today = tashkentDateStr(now);
      const holidays = await recurrenceHolidays(
        this.prisma,
        rule.branchId,
        today,
      );
      data.nextRunDate = utcMidnightFromDateStr(
        nextRunDateAfter(schedule, today, holidays),
      );
    }
    await this.prisma.taskRecurrence.update({ where: { id }, data });
    const view = await loadRecurrenceView(
      this.prisma,
      id,
      this.tasks.actorPerson(actor),
    );
    if (!view) throw new NotFoundException('Takrorlanish topilmadi');
    return view;
  }

  /** The rule goes; its tasks stay (`Task.recurrenceId` → NULL by the FK). */
  async remove(id: string, actor: TaskActor): Promise<{ ok: true }> {
    await this.manageable(id, actor);
    await this.prisma.taskRecurrence.delete({ where: { id } });
    return { ok: true };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  assertMayLinkEntity,
  batchIdFor,
  createCopiesTx,
  emitTaskCreated,
} from './task-create';
import { scheduleTaskOutbox } from './task-outbox.service';
import { reachablePeople } from './task-people';
import {
  isWorkingDay,
  nextRunDateAfter,
  recurrenceDueAt,
  recurrenceHolidays,
  runGroups,
} from './task-recurrence-rules';
import { OPEN_STATUSES } from './task-transitions';
import { TasksService, type TaskActor } from './tasks.service';
import type { CreateTaskDto } from './dto/create-task.dto';

const RULE_SELECT = {
  id: true,
  companyId: true,
  branchId: true,
  authorId: true,
  freq: true,
  weekdays: true,
  dayOfMonth: true,
  dueTime: true,
  title: true,
  description: true,
  priority: true,
  assigneeIds: true,
  watcherIds: true,
  steps: true,
  entityType: true,
  entityId: true,
  separateCopies: true,
  nextRunDate: true,
} satisfies Prisma.TaskRecurrenceSelect;
type Rule = Prisma.TaskRecurrenceGetPayload<{ select: typeof RULE_SELECT }>;

export type RunOutcome =
  | 'created'
  | 'taken'
  | 'open'
  | 'no-assignee'
  | 'stopped'
  | 'off';

// ponytail: 500 rules a morning, oldest first; the rest are caught up the next
// morning (`nextRunDate <= today`). Raise it when a company has more.
const RULE_BATCH = 500;
const OPEN = [...OPEN_STATUSES];

function templateDto(rule: Rule): CreateTaskDto {
  return {
    title: rule.title,
    description: rule.description ?? undefined,
    assigneeIds: rule.assigneeIds,
    priority: rule.priority,
    entityType: rule.entityType ?? undefined,
    entityId: rule.entityId ?? undefined,
    steps: rule.steps.map((title) => ({ title })),
  };
}

/**
 * Every morning at 07:00 Tashkent (spec §9.6): each active rule whose
 * `nextRunDate` has come gives its task (ADR-0084). The FIRST write of the
 * run's transaction moves `nextRunDate` only if it still holds the value read
 * — two instances during a deploy: the second gets `count 0` and makes
 * nothing; a failed insert rolls the move back and tomorrow retries.
 *
 * `CRONS_ENABLED=false` leaves `ScheduleModule` unloaded (`app.module.ts`), so
 * `@Cron` never fires; `run()` itself has no flag to read.
 */
@Injectable()
export class TaskRecurrenceRunner {
  private readonly logger = new Logger(TaskRecurrenceRunner.name);
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private tasks: TasksService,
  ) {}

  @Cron('0 0 7 * * *', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run(new Date());
    } finally {
      this.running = false;
    }
  }

  async run(now: Date): Promise<Record<RunOutcome, number>> {
    const today = tashkentDateStr(now);
    const rules = await this.prisma.taskRecurrence.findMany({
      where: {
        active: true,
        nextRunDate: { lte: utcMidnightFromDateStr(today) },
      },
      select: RULE_SELECT,
      orderBy: { nextRunDate: 'asc' },
      take: RULE_BATCH,
    });
    const total: Record<RunOutcome, number> = {
      created: 0,
      taken: 0,
      open: 0,
      'no-assignee': 0,
      stopped: 0,
      off: 0,
    };
    for (const rule of rules) {
      try {
        total[await this.runOne(rule, today)] += 1;
      } catch (err) {
        this.logger.error(
          `recurrence ${rule.id} failed: ${(err as Error).message}`,
        );
      }
    }
    return total;
  }

  private async runOne(rule: Rule, today: string): Promise<RunOutcome> {
    const holidays = await recurrenceHolidays(
      this.prisma,
      rule.branchId,
      today,
    );
    // Never a task due on a Sunday or the branch's holiday: wait for a working day.
    if (!isWorkingDay(today, holidays)) return 'off';
    const held = { id: rule.id, active: true, nextRunDate: rule.nextRunDate };

    // The author's rights TODAY, not the day the rule was written.
    let actor: TaskActor;
    try {
      actor = await this.tasks.loadActor(rule.authorId, rule.companyId, null);
      await assertMayLinkEntity(this.prisma, actor, {
        entityType: rule.entityType ?? undefined,
        entityId: rule.entityId ?? undefined,
      });
    } catch (err) {
      if (
        !(
          err instanceof ForbiddenException ||
          err instanceof NotFoundException ||
          err instanceof BadRequestException
        )
      ) {
        throw err;
      }
      const { count } = await this.prisma.taskRecurrence.updateMany({
        where: held,
        data: { active: false },
      });
      if (count === 0) return 'taken';
      this.logger.warn(
        `recurrence ${rule.id} stopped: ${(err as Error).message}`,
      );
      return 'stopped';
    }

    const people = await reachablePeople(
      this.prisma,
      this.tasks.actorPerson(actor),
      rule.companyId,
      rule.assigneeIds,
      rule.watcherIds,
    );
    const schedule = {
      freq: rule.freq,
      weekdays: rule.weekdays,
      dayOfMonth: rule.dayOfMonth,
      dueTime: rule.dueTime,
    };
    const next = utcMidnightFromDateStr(
      nextRunDateAfter(schedule, today, holidays),
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
        const { count } = await tx.taskRecurrence.updateMany({
          where: held,
          data: { nextRunDate: next },
        });
        if (count === 0) return 'taken' as const;
        if (people.assigneeIds.length === 0) return 'no-assignee' as const;
        const open = await tx.task.findMany({
          where: { recurrenceId: rule.id, status: { in: OPEN } },
          select: {
            participants: {
              where: { role: 'ASSIGNEE' },
              select: { userId: true },
            },
          },
        });
        const groups = runGroups(
          rule.separateCopies,
          people.assigneeIds,
          open.map((t) => ({
            assigneeIds: t.participants.map((p) => p.userId),
          })),
        );
        if (groups.length === 0) return 'open' as const;
        return createCopiesTx(
          tx,
          {
            companyId: rule.companyId,
            branchId: rule.branchId,
            authorId: rule.authorId,
            dto: templateDto(rule),
            dueAt: recurrenceDueAt(today, rule.dueTime),
            batchId: batchIdFor(groups),
            watcherIds: people.watcherIds,
            recurrenceId: rule.id,
            via: 'SYSTEM',
          },
          groups,
          scheduleTaskOutbox,
        );
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (typeof result === 'string') {
      if (result === 'no-assignee') {
        this.logger.warn(`recurrence ${rule.id}: nobody left to assign`);
      }
      return result;
    }
    emitTaskCreated(this.emitter, result, rule.authorId, people.watcherIds);
    return 'created';
  }
}

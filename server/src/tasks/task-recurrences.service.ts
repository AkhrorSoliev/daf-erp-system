import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { batchIdFor, createCopiesTx, emitTaskCreated } from './task-create';
import { scheduleTaskOutbox } from './task-outbox.service';
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
}

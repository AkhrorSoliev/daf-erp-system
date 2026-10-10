import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import type { PaymentPromiseOverduePayload } from '../payment-promises/payment-promise-cron.service';
import {
  CALL_LOG_CREATED,
  type CallLogCreatedPayload,
} from '../call-logs/call-log-events';
import {
  autoTaskAssigneeIds,
  brokenPromiseText,
  callbackAssigneeIds,
  callbackText,
  sourceKeyOf,
  studentName,
  systemDueAt,
} from './task-auto-rules';
import { createSystemTask, type SystemTaskInput } from './task-auto-write';
import { TASK_EVENTS, type TaskAssignedPayload } from './task-events';
import { OPEN_STATUSES } from './task-transitions';

const HOLIDAY_LOOKAHEAD_MS = 14 * 864e5;

/**
 * «Buzilgan va'da» and «Qayta qo'ng'iroq» (spec §7): created from the events
 * of their sources, after those committed. The lead kind is the hourly
 * `TaskAutoLeadsService`; closing is `TaskAutoCloseListener`.
 */
@Injectable()
export class TaskAutoService {
  private readonly logger = new Logger(TaskAutoService.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
  ) {}

  /**
   * One task per student whose promise the 09:00 cron broke, for the branch's
   * administrators (ADR-0083: they no longer get the list). Only students who
   * still owe `MIN_ALERT_DEBT` — the same people the list names — and not
   * those who already have an open «Buzilgan va'da» task.
   */
  @OnEvent('payment-promise.overdue')
  async onPromisesBroken(
    p: PaymentPromiseOverduePayload,
    now = new Date(),
  ): Promise<void> {
    try {
      const promises = await this.prisma.paymentPromise.findMany({
        where: { id: { in: p.promiseIds }, companyId: p.companyId },
        select: {
          id: true,
          promiseDate: true,
          promisedAmount: true,
          comment: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              balance: true,
            },
          },
        },
      });
      // One promise per student: the latest one speaks for them.
      const latest = new Map<number, (typeof promises)[number]>();
      for (const x of promises) {
        if (-x.student.balance < MIN_ALERT_DEBT) continue;
        const seen = latest.get(x.student.id);
        if (!seen || x.promiseDate > seen.promiseDate) {
          latest.set(x.student.id, x);
        }
      }
      if (latest.size === 0) return;
      const open = await this.prisma.task.findMany({
        where: {
          companyId: p.companyId,
          kind: 'BROKEN_PROMISE',
          status: { in: [...OPEN_STATUSES] },
          entityType: 'Student',
          entityId: { in: [...latest.keys()].map(String) },
        },
        select: { entityId: true },
      });
      const hasTask = new Set(open.map((t) => t.entityId));
      const owing = [...latest.values()].filter(
        (x) => !hasTask.has(String(x.student.id)),
      );
      if (owing.length === 0) return;
      const assigneeIds = await autoTaskAssigneeIds(
        this.prisma,
        p.companyId,
        p.branchId,
      );
      const dueAt = systemDueAt(
        tashkentDateStr(now),
        await this.holidays(p.branchId, now),
        now,
      );
      for (const x of owing) {
        // One failing student must not cost the others their task.
        try {
          await this.make({
            companyId: p.companyId,
            branchId: p.branchId,
            kind: 'BROKEN_PROMISE',
            ...brokenPromiseText({
              name: studentName(x.student),
              debt: -x.student.balance,
              promiseDate: x.promiseDate,
              promisedAmount: x.promisedAmount,
              comment: x.comment,
            }),
            dueAt,
            entityId: String(x.student.id),
            sourceKey: sourceKeyOf('BROKEN_PROMISE', x.id),
            assigneeIds,
          });
        } catch (err) {
          this.logger.error(
            `broken promise ${x.id}: task failed: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `payment-promise.overdue tasks failed: ${(err as Error).message}`,
      );
    }
  }

  /** A call logged with «Keyingi bog'lanish sanasi»: a task for the caller on that day. */
  @OnEvent(CALL_LOG_CREATED)
  async onCallLogged(
    { callLog }: CallLogCreatedPayload,
    now = new Date(),
  ): Promise<void> {
    if (!callLog.followUpAt) return;
    try {
      const [student, assigneeIds] = await Promise.all([
        this.prisma.student.findFirst({
          where: { id: callLog.studentId, companyId: callLog.companyId },
          select: { firstName: true, lastName: true },
        }),
        callbackAssigneeIds(this.prisma, callLog.companyId, callLog.calledById),
      ]);
      if (!student) return;
      const dueAt = systemDueAt(
        tashkentDateStr(callLog.followUpAt),
        await this.holidays(callLog.branchId, callLog.followUpAt),
        now,
      );
      await this.make({
        companyId: callLog.companyId,
        branchId: callLog.branchId,
        kind: 'CALLBACK',
        ...callbackText({ name: studentName(student), note: callLog.note }),
        dueAt,
        entityId: String(callLog.studentId),
        sourceKey: sourceKeyOf('CALLBACK', callLog.id),
        assigneeIds,
      });
    } catch (err) {
      this.logger.error(
        `callback task for call ${callLog.id} failed: ${(err as Error).message}`,
      );
    }
  }

  /** Writes the task and, once committed, tells its assignees (bell, push, Telegram). */
  private async make(input: SystemTaskInput): Promise<void> {
    const task = await createSystemTask(this.prisma, input);
    if (!task) return;
    this.emitter.emit(TASK_EVENTS.ASSIGNED, {
      task,
      actorId: null,
      userIds: [...new Set(input.assigneeIds)],
      created: true,
    } satisfies TaskAssignedPayload);
  }

  private holidays(branchId: number | null, from: Date) {
    return buildHolidayDateSet(
      this.prisma,
      from,
      new Date(from.getTime() + HOLIDAY_LOOKAHEAD_MS),
      branchId,
    );
  }
}

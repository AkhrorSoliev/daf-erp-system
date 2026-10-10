import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { Prisma, type TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { GROUP_DELETED } from '../groups/group-events';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import type { PaymentPromiseOverduePayload } from '../payment-promises/payment-promise-cron.service';
import { TASK_EVENTS, type TaskEventTask } from '../tasks/task-events';
import {
  UNMARKED_LESSON_CLOSED,
  UNMARKED_LESSON_HELD,
  UNMARKED_LESSON_NOT_HELD,
} from '../unmarked-lessons/unmarked-lesson-events';
import { BROKEN_PROMISES_ENTITY } from './notification-events.listener';
import { LESSON_ALERT_TYPES, lessonGroupKey } from './notification-kind';
import { NotificationsGateway } from './notifications.gateway';
import { pastLessonAlerts } from './past-lesson-alerts';

/** Ids per `resolve` call: a long list never becomes one huge `IN (…)`. */
const SWEEP_CHUNK = 500;

/** A lesson event: the group and its lesson day ('YYYY-MM-DD', Tashkent). */
interface LessonDayEvent {
  companyId: number;
  groupId: string;
  date: string;
}

interface ClosableTask {
  id: string;
  companyId: number;
  status: TaskStatus;
}

/** The 09:00 list rows of one branch (`null` = promises with no branch → 'all'). */
function brokenPromiseList(
  companyId: number,
  branchId: number | null,
): Prisma.NotificationWhereInput {
  return {
    companyId,
    type: 'PAYMENT_PROMISE_OVERDUE',
    relatedEntityType: BROKEN_PROMISES_ENTITY,
    relatedEntityId: String(branchId ?? 'all'),
  };
}

/**
 * Spec 2026-10-07 §8: an alert closes itself when its job is done. Every event
 * heard here is emitted after its transaction commits. Matching OPEN action
 * rows of every recipient get `resolvedAt`, and each recipient's open bells
 * hear `notification.resolved`. Information rows are never touched.
 */
@Injectable()
export class NotificationResolverService {
  private readonly logger = new Logger(NotificationResolverService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  // ---------- lessons ----------

  @OnEvent('attendance.completed')
  async onAttendanceCompleted(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
  }

  /** A register only QR scans took emits this and never `attendance.completed`. */
  @OnEvent('attendance.student.recorded')
  async onStudentRecorded(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
  }

  @OnEvent('lesson-cancellation.created')
  async onLessonCancelled(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
  }

  @OnEvent('lesson-reschedule.created')
  async onLessonMoved(p: {
    companyId: number;
    groupId: string;
    originalDate: string;
  }): Promise<void> {
    await this.resolveLesson({ ...p, date: p.originalDate });
  }

  @OnEvent(UNMARKED_LESSON_HELD)
  async onLessonHeld(p: LessonDayEvent): Promise<void> {
    await this.resolveAnswered(p);
  }

  @OnEvent(UNMARKED_LESSON_NOT_HELD)
  async onLessonNotHeld(p: LessonDayEvent): Promise<void> {
    await this.resolveAnswered(p);
  }

  /** A question closed unanswered (its day lost its lesson, its group went). */
  @OnEvent(UNMARKED_LESSON_CLOSED)
  async onLessonClosed(p: LessonDayEvent): Promise<void> {
    await this.resolveAnswered(p);
  }

  /**
   * A deleted group is never taught again, so none of its lesson alerts can be
   * acted on, whichever day they were sent (a day with no open question gets
   * no `UNMARKED_LESSON_CLOSED`).
   */
  @OnEvent(GROUP_DELETED)
  async onGroupDeleted(p: {
    companyId: number;
    groupId: string;
  }): Promise<void> {
    await this.resolve({
      companyId: p.companyId,
      relatedEntityType: 'Group',
      relatedEntityId: p.groupId,
      type: { in: [...LESSON_ALERT_TYPES] },
    });
  }

  // ---------- tasks ----------

  /**
   * A closed task closes all its notices. A system task that is still open may
   * have just been claimed (the first assignee to act takes it, the other
   * assignees' copies go): the administrators who lost it have nothing left to
   * do. They get no `TASK_EVENTS.UNASSIGNED`, which would tell them they were
   * removed.
   */
  @OnEvent(TASK_EVENTS.STATUS_CHANGED)
  async onTaskStatus(p: { task: TaskEventTask }): Promise<void> {
    if (await this.resolveIfClosed(p.task)) return;
    await this.resolveClaimLosers(p.task);
  }

  @OnEvent(TASK_EVENTS.CANCELLED)
  async onTaskCancelled(p: { task: TaskEventTask }): Promise<void> {
    await this.resolveIfClosed(p.task);
  }

  /** Either answer ends the review request; an accepted task is closed too. */
  @OnEvent(TASK_EVENTS.REVIEWED)
  async onTaskReviewed(p: { task: TaskEventTask }): Promise<void> {
    await this.resolve({
      companyId: p.task.companyId,
      taskId: p.task.id,
      type: 'TASK_REVIEW',
    });
    await this.resolveIfClosed(p.task);
  }

  @OnEvent(TASK_EVENTS.UNASSIGNED)
  async onTaskUnassigned(p: {
    task: TaskEventTask;
    userIds: number[];
  }): Promise<void> {
    await this.resolve({
      companyId: p.task.companyId,
      taskId: p.task.id,
      userId: { in: p.userIds },
    });
  }

  // ---------- payments ----------

  /**
   * Two shapes of the overdue alert. The old one is one row per student
   * (`relatedEntityType 'Student'`): it closes when the debt is cleared, the
   * same test `settleKeptPromises` uses for "kept" (a BROKEN promise never
   * turns KEPT). The 09:00 list is one row per branch and day
   * (`BROKEN_PROMISES_ENTITY`): it closes when nobody on it still owes.
   */
  @OnEvent('payment.received')
  async onPaymentReceived(p: {
    companyId: number;
    studentId: number;
    studentBalance: number | null;
  }): Promise<void> {
    if (p.studentBalance !== null && p.studentBalance >= 0) {
      await this.resolve({
        companyId: p.companyId,
        type: 'PAYMENT_PROMISE_OVERDUE',
        relatedEntityType: 'Student',
        relatedEntityId: String(p.studentId),
      });
    }
    await this.closePaidLists(p.companyId, p.studentId);
  }

  /**
   * A newer 09:00 list of a branch replaces the older ones of that branch.
   * Heard together with the listener that creates the new rows, so the bound
   * is the start of today: the rows of this very run are never touched,
   * whichever handler runs first.
   */
  @OnEvent('payment-promise.overdue')
  async onPromiseListSent(p: PaymentPromiseOverduePayload): Promise<void> {
    await this.resolve({
      ...brokenPromiseList(p.companyId, p.branchId),
      createdAt: { lt: tashkentDayStartUtc(tashkentDateStr(new Date())) },
    });
  }

  // ---------- nightly ----------

  /**
   * The backstop for every lesson alert whose closing event never came (a group
   * that left ACTIVE after the alerts went out, a holiday entered on the day,
   * the check-then-act race at the lesson's start). Once a lesson's day is past
   * and no «Dars bo'ldimi?» question is waiting for it, nothing can close its
   * alerts any more (`pastLessonAlerts`). All companies; each write carries the
   * row's own `companyId`, and `resolve` tells the owners' bells.
   *
   * ponytail: one scan of the open rows, nightly — a partial index on
   * `resolvedAt IS NULL` if the table ever makes that slow.
   */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async closePastLessonAlerts(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<
        { id: string; companyId: number }[]
      >(
        Prisma.sql`SELECT n."id", n."companyId" FROM "Notification" n
          WHERE ${pastLessonAlerts(tashkentDateStr(new Date()))}`,
      );
      const byCompany = new Map<number, string[]>();
      for (const r of rows) {
        const ids = byCompany.get(r.companyId) ?? [];
        ids.push(r.id);
        byCompany.set(r.companyId, ids);
      }
      let closed = 0;
      for (const [companyId, ids] of byCompany) {
        for (let i = 0; i < ids.length; i += SWEEP_CHUNK) {
          closed += await this.resolve({
            companyId,
            id: { in: ids.slice(i, i + SWEEP_CHUNK) },
          });
        }
      }
      if (closed > 0) this.logger.log(`closed ${closed} past lesson alerts`);
      return closed;
    } catch (error) {
      this.logger.error(
        `past lesson alerts sweep failed: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  // ---------- core ----------

  /**
   * A list is the BROKEN promises of one branch that the cron flipped on one
   * Tashkent day (`reminderFiredAt`): the rows it wrote that morning name
   * exactly them. It closes, for every recipient, once none of those students
   * owes `MIN_ALERT_DEBT` any more (a smaller debt was never listed). The
   * balances are read now, after the payment's commit, not from the event.
   */
  private async closePaidLists(
    companyId: number,
    studentId: number,
  ): Promise<void> {
    try {
      const mine = await this.prisma.paymentPromise.findMany({
        where: {
          companyId,
          studentId,
          status: 'BROKEN',
          reminderFiredAt: { not: null },
        },
        select: { branchId: true, reminderFiredAt: true },
      });
      const lists = new Map<string, { branchId: number | null; day: string }>();
      for (const m of mine) {
        if (!m.reminderFiredAt) continue;
        const day = tashkentDateStr(m.reminderFiredAt);
        lists.set(`${m.branchId ?? 'all'}:${day}`, {
          branchId: m.branchId,
          day,
        });
      }
      for (const { branchId, day } of lists.values()) {
        const inDay = tashkentDayRangeUtc(day);
        const stillOwes = await this.prisma.paymentPromise.findFirst({
          where: {
            companyId,
            branchId,
            status: 'BROKEN',
            reminderFiredAt: inDay,
            student: { balance: { lte: -MIN_ALERT_DEBT } },
          },
          select: { id: true },
        });
        if (stillOwes) continue;
        await this.resolve({
          ...brokenPromiseList(companyId, branchId),
          createdAt: inDay,
        });
      }
    } catch (error) {
      this.logger.error(
        `broken-promise list lookup failed (student ${studentId}): ${(error as Error).message}`,
      );
    }
  }

  private resolveLesson(p: LessonDayEvent): Promise<number> {
    return this.resolve({
      companyId: p.companyId,
      relatedEntityType: 'Group',
      relatedEntityId: p.groupId,
      groupKey: {
        in: LESSON_ALERT_TYPES.map((type) => lessonGroupKey(type, p.date)),
      },
    });
  }

  /** «Dars bo'ldimi?» answered: the day's alerts and its closed task's notices. */
  private async resolveAnswered(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
    try {
      const row = await this.prisma.unmarkedLesson.findUnique({
        where: {
          groupId_date: {
            groupId: p.groupId,
            date: utcMidnightFromDateStr(p.date),
          },
        },
        select: {
          task: { select: { id: true, companyId: true, status: true } },
        },
      });
      if (row?.task) await this.resolveIfClosed(row.task);
    } catch (error) {
      this.logger.error(
        `lesson task lookup failed (${p.groupId} ${p.date}): ${(error as Error).message}`,
      );
    }
  }

  /** Whether the task is closed (and so all its notices with it). */
  private async resolveIfClosed(task: ClosableTask): Promise<boolean> {
    if (task.status !== 'DONE' && task.status !== 'CANCELLED') return false;
    await this.resolve({ companyId: task.companyId, taskId: task.id });
    return true;
  }

  /** The participants left after the claim, and the author, keep their notices. */
  private async resolveClaimLosers(task: TaskEventTask): Promise<void> {
    if (task.kind === 'MANUAL' || task.participants.length === 0) return;
    const keep = task.participants.map((x) => x.userId);
    if (task.authorId !== null) keep.push(task.authorId);
    await this.resolve({
      companyId: task.companyId,
      taskId: task.id,
      userId: { notIn: keep },
    });
  }

  /**
   * Stamps the open action rows matching `where` and returns how many it
   * changed. Never throws. A recipient hears `notification.resolved` only for
   * a write that changed rows: a racing resolver that got there first has
   * already told them.
   */
  async resolve(where: Prisma.NotificationWhereInput): Promise<number> {
    try {
      const rows = await this.prisma.notification.findMany({
        where: { ...where, actionRequired: true, resolvedAt: null },
        select: { id: true, userId: true },
      });
      if (rows.length === 0) return 0;
      const resolvedAt = new Date();
      const { count } = await this.prisma.notification.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, resolvedAt: null },
        data: { resolvedAt },
      });
      if (count === 0) return 0;
      const byUser = new Map<number, string[]>();
      for (const r of rows) {
        byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.id]);
      }
      for (const [userId, ids] of byUser) {
        this.gateway.sendToUser(userId, {
          type: 'notification.resolved',
          ids,
          resolvedAt: resolvedAt.toISOString(),
        });
      }
      return count;
    } catch (error) {
      this.logger.error(`resolve failed: ${(error as Error).message}`);
      return 0;
    }
  }
}

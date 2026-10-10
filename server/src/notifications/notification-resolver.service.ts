import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { GROUP_DELETED } from '../groups/group-events';
import { TASK_EVENTS, type TaskEventTask } from '../tasks/task-events';
import {
  UNMARKED_LESSON_CLOSED,
  UNMARKED_LESSON_HELD,
  UNMARKED_LESSON_NOT_HELD,
} from '../unmarked-lessons/unmarked-lesson-events';
import { LESSON_ALERT_TYPES, lessonGroupKey } from './notification-kind';
import { NotificationsGateway } from './notifications.gateway';

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
   * The overdue alert is written when a promise turns BROKEN, and a BROKEN
   * promise never turns KEPT; the debt cleared is the same test
   * `settleKeptPromises` uses for "kept".
   */
  @OnEvent('payment.received')
  async onPaymentReceived(p: {
    companyId: number;
    studentId: number;
    studentBalance: number | null;
  }): Promise<void> {
    if (p.studentBalance === null || p.studentBalance < 0) return;
    await this.resolve({
      companyId: p.companyId,
      type: 'PAYMENT_PROMISE_OVERDUE',
      relatedEntityType: 'Student',
      relatedEntityId: String(p.studentId),
    });
  }

  // ---------- core ----------

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

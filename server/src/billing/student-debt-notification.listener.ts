import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AttendanceStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import type { AttendanceStudentRecordedPayload } from '../attendance/student-attendance-notification.listener';

/**
 * Queues a DEBT_CHARGE row for the 20:00 Telegram digest (ADR-0025) when the
 * attendance just taken pushed the student's balance into the red — the
 * billing layer wrote a SINGLE_UNCOVERED LESSON_DEDUCTION for it. The digest
 * re-checks at send time that the deduction still stands and the balance is
 * still negative, so a debt paid off during the day is never reported.
 *
 * Piggy-backs on the post-commit `attendance.student.recorded` event, so the
 * deduction row is visible when we query.
 */
@Injectable()
export class StudentDebtNotificationListener {
  private readonly logger = new Logger(StudentDebtNotificationListener.name);

  constructor(
    private prisma: PrismaService,
    private digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent('attendance.student.recorded')
  async handle(payload: AttendanceStudentRecordedPayload) {
    const { studentId, groupId, groupName, date, newStatus, companyId } =
      payload;

    // Only attendance statuses that trigger billing can produce debt.
    if (
      newStatus !== AttendanceStatus.PRESENT &&
      newStatus !== AttendanceStatus.LATE &&
      newStatus !== AttendanceStatus.ABSENT
    ) {
      return;
    }

    try {
      const attendance = await this.prisma.attendance.findFirst({
        where: { groupId, studentId, date: utcMidnightFromDateStr(date) },
        select: { id: true },
      });
      if (!attendance) return;

      const uncovered = await this.prisma.transaction.findFirst({
        where: {
          attendanceId: attendance.id,
          studentId,
          type: TransactionType.LESSON_DEDUCTION,
          reversedAt: null,
          metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
        },
        select: { metadata: true },
      });
      if (!uncovered) return;

      const metadata = (uncovered.metadata ?? {}) as Record<string, unknown>;
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: studentId,
        companyId,
        category: TelegramDigestCategory.DEBT_CHARGE,
        relatedEntityId: attendance.id,
        payload: {
          attendanceId: attendance.id,
          groupName,
          perLessonCost: Number(metadata.perLessonCost ?? 0),
          date,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Debt digest enqueue failed for student ${studentId}: ${describeError(err)}`,
      );
    }
  }
}

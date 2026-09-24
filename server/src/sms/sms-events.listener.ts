import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import {
  EnrollmentMessagePayload,
  RemovalMessagePayload,
} from './sms-templates';

export interface StudentEnrolledEvent extends EnrollmentMessagePayload {
  studentId: number;
  companyId: number | null;
}

export interface StudentRemovedEvent extends RemovalMessagePayload {
  studentId: number;
  companyId: number | null;
}

/**
 * Queues the student's "added to / removed from a group" notice for the 20:00
 * Telegram digest (ADR-0025). The text is still built from sms-templates — by
 * the digest renderer, at send time.
 */
@Injectable()
export class SmsEventsListener {
  private readonly logger = new Logger(SmsEventsListener.name);

  constructor(private readonly digestQueue: TelegramDigestQueueService) {}

  @OnEvent('student.enrolled')
  async handleStudentEnrolled(payload: StudentEnrolledEvent) {
    if (payload.companyId == null) {
      // Both emitters pass Student.companyId, which is never null; the event
      // type allows it, so say so instead of dropping silently.
      this.logger.warn(
        `student.enrolled without companyId for student ${payload.studentId} — not queued`,
      );
      return;
    }
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.STUDENT_ENROLLED,
        payload: {
          groupName: payload.groupName,
          courseName: payload.courseName,
          days: payload.days,
          exactDays: payload.exactDays,
          lessonStartTime: payload.lessonStartTime,
          lessonEndTime: payload.lessonEndTime,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue enrollment notice for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('student.removed_from_group')
  async handleStudentRemoved(payload: StudentRemovedEvent) {
    if (payload.companyId == null) {
      this.logger.warn(
        `student.removed_from_group without companyId for student ${payload.studentId} — not queued`,
      );
      return;
    }
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.STUDENT_REMOVED,
        payload: { groupName: payload.groupName, reason: payload.reason },
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue removal notice for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EnrollmentStatus, SmsMessageType } from '@prisma/client';
import { loadContactPhone } from '../balance-notices/load-transfer-state';
import {
  addDaysToDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { HolidaysService } from '../holidays/holidays.service';
import { nextLessonDay } from '../lesson-cancellations/pause-lesson-days';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { describeError } from '../telegram-digest/telegram-send';
import {
  GROUP_PAUSE_MESSAGE_EVENT,
  type GroupPauseMessagePayload,
} from './group-pause-events';
import {
  groupPausedText,
  groupResumeDayText,
  groupResumedText,
} from './group-pause-text';

/**
 * Tells every student of a group, at once, that it was paused, that its
 * restart day changed, or that it is open again (ADR-0119, §7). Pattern of
 * `RefundStudentMessagesListener`: `SmsService` writes the message row and the
 * history line, a student without a linked chat is skipped, and an error is
 * logged and swallowed so a message can never affect the group.
 */
@Injectable()
export class GroupPauseMessagesListener {
  private readonly logger = new Logger(GroupPauseMessagesListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly holidays: HolidaysService,
  ) {}

  @OnEvent(GROUP_PAUSE_MESSAGE_EVENT)
  async handle(p: GroupPauseMessagePayload): Promise<void> {
    try {
      const group = await this.prisma.group.findFirst({
        where: { id: p.groupId, companyId: p.companyId, deletedAt: null },
        select: {
          name: true,
          branchId: true,
          exactDays: true,
          lessonStartTime: true,
        },
      });
      if (!group) return;
      if (p.kind !== 'PAUSED' && !p.resumeDay) return;

      const lesson =
        p.kind === 'RESUMED' && p.resumeDay
          ? await this.firstLesson(p.resumeDay, group)
          : null;
      if (p.kind === 'RESUMED' && !lesson) return;

      const phone = await loadContactPhone(
        this.prisma,
        group.branchId,
        p.companyId,
      );
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          groupId: p.groupId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
          student: { deletedAt: null, telegramChatId: { not: null } },
        },
        select: { student: { select: { id: true, firstName: true } } },
      });

      for (const { student } of enrollments) {
        const text = this.text(p, group.name, student.firstName, phone, lesson);
        if (!text) continue;
        try {
          await this.sms.sendToStudent(
            student.id,
            text,
            SmsMessageType.AUTO,
            undefined,
            p.companyId,
          );
        } catch (err) {
          this.logger.warn(`Pauza xabari ${student.id}: ${describeError(err)}`);
        }
      }
    } catch (err) {
      this.logger.error(
        `Guruh ${p.groupId} pauza xabarlari: ${describeError(err)}`,
      );
    }
  }

  private text(
    p: GroupPauseMessagePayload,
    groupName: string,
    firstName: string,
    phone: string | null,
    lesson: { day: string; time: string | null } | null,
  ): string | null {
    if (p.kind === 'PAUSED') {
      return groupPausedText({
        firstName,
        groupName,
        resumeDay: p.resumeDay,
        phone,
      });
    }
    if (p.kind === 'RESUME_DAY' && p.resumeDay) {
      return groupResumeDayText({
        firstName,
        groupName,
        resumeDay: p.resumeDay,
      });
    }
    if (p.kind === 'RESUMED' && lesson) {
      return groupResumedText({
        firstName,
        groupName,
        firstLessonDay: lesson.day,
        firstLessonTime: lesson.time,
      });
    }
    return null;
  }

  /** The first lesson on or after the restart day, holidays skipped. */
  private async firstLesson(
    resumeDay: string,
    group: {
      branchId: number;
      exactDays: string[];
      lessonStartTime: string | null;
    },
  ): Promise<{ day: string; time: string | null } | null> {
    const day = await nextLessonDay(
      addDaysToDateStr(resumeDay, -1),
      group.exactDays,
      async (d) =>
        Boolean(
          await this.holidays.findActiveHolidayCovering(
            utcMidnightFromDateStr(d),
            group.branchId,
          ),
        ),
    );
    return day ? { day, time: group.lessonStartTime } : null;
  }
}

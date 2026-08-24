import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';
import { EntityHistoryService } from '../common/entity-history';
import { truncateChars } from '../common/utils/text.util';
import type { LessonReschedulePayload } from './lesson-reschedules.service';

const WEEKDAY_LABEL: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

type EventKind = 'created' | 'updated';

/**
 * Fans out a lesson-reschedule event to:
 *   - active group teachers — full 4-channel (DB Notification + SSE +
 *     Web Push + Telegram), so the bell on admin / lehrer portal lights
 *     up and the bot sends a detailed message.
 *   - active enrolled students — Telegram via SmsService.sendToStudent,
 *     which persists to SmsMessage and shows up in the student profile
 *     "SMS" tab. Students without `telegramChatId` produce a FAILED row
 *     (existing SmsService behavior) but the operation continues.
 *
 * After sending, an aggregate row is recorded in EntityHistory under
 * the group (so the "Tarix" tab shows "N students notified, M missing").
 *
 * Errors per recipient are logged at warn level and never thrown — a
 * single failed Telegram delivery must not block the rest of the fan-out.
 */
@Injectable()
export class LessonRescheduleEventsListener {
  private readonly logger = new Logger(LessonRescheduleEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private telegramService: TelegramService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  @OnEvent('lesson-reschedule.created')
  async handleCreated(payload: LessonReschedulePayload) {
    await this.notify(payload, 'created');
  }

  @OnEvent('lesson-reschedule.updated')
  async handleUpdated(payload: LessonReschedulePayload) {
    await this.notify(payload, 'updated');
  }

  private async notify(p: LessonReschedulePayload, kind: EventKind) {
    try {
      const group = await this.prisma.group.findFirst({
        where: { id: p.groupId, deletedAt: null },
        select: {
          id: true,
          name: true,
          teachers: {
            where: {
              teacher: {
                deletedAt: null,
                isActive: true,
              },
            },
            select: {
              teacher: {
                select: { id: true, telegramChatId: true },
              },
            },
          },
        },
      });
      if (!group) return;

      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          groupId: p.groupId,
          deletedAt: null,
          status: 'ACTIVE',
          student: { deletedAt: null, isActive: true },
        },
        select: { student: { select: { id: true, telegramChatId: true } } },
      });

      const roomName = p.newRoomId
        ? await this.fetchRoomName(p.newRoomId)
        : null;

      const studentText = composeStudentText(p, kind);
      const teacherText = composeTeacherText(p, kind, group.name, roomName);
      const teacherTitle =
        kind === 'created'
          ? "Dars ko'chirildi"
          : "Ko'chirilgan dars yangilandi";

      // Students — SmsService handles per-student delivery + persistence.
      let studentsNotified = 0;
      let studentsMissing = 0;
      for (const e of enrollments) {
        if (!e.student.telegramChatId) {
          studentsMissing++;
          continue;
        }
        try {
          await this.smsService.sendToStudent(
            e.student.id,
            studentText,
            SmsMessageType.AUTO,
            p.scheduledById,
            p.companyId,
          );
          studentsNotified++;
        } catch (err) {
          this.logger.warn(
            `SmsService.sendToStudent failed for student ${e.student.id}: ${this.errMsg(err)}`,
          );
        }
      }

      // Teachers — full 4-channel.
      let teachersNotified = 0;
      for (const t of group.teachers) {
        try {
          await this.deliverToTeacher(
            t.teacher.id,
            t.teacher.telegramChatId,
            teacherTitle,
            teacherText,
            p.groupId,
            p.companyId,
          );
          teachersNotified++;
        } catch (err) {
          this.logger.warn(
            `Teacher delivery failed for user ${t.teacher.id}: ${this.errMsg(err)}`,
          );
        }
      }

      await this.entityHistoryService.recordCreate({
        entityType: 'Group',
        entityId: p.groupId,
        newValues: {
          action: 'TELEGRAM_XABARNOMASI_YUBORILDI',
          voqea: `lesson-reschedule.${kind}`,
          sana: p.newDate,
          oquvchilarga_yuborildi: studentsNotified,
          telegramsiz_oquvchilar: studentsMissing,
          ustozlarga_yuborildi: teachersNotified,
          matn_namunasi: truncateChars(studentText, 120),
        },
        changedById: p.scheduledById,
        companyId: p.companyId,
      });
    } catch (err) {
      this.logger.error(
        `LessonRescheduleEventsListener (${kind}) failed: ${this.errMsg(err)}`,
      );
    }
  }

  private async deliverToTeacher(
    userId: number,
    telegramChatId: string | null,
    title: string,
    message: string,
    groupId: string,
    companyId: number,
  ) {
    // 1. DB notification
    const notification = await this.notificationsService.create({
      userId,
      type: NotificationType.LESSON_RESCHEDULED,
      title,
      message,
      relatedEntityType: 'Group',
      relatedEntityId: groupId,
      companyId,
    });

    // 2. SSE
    this.gateway.sendToUser(userId, {
      type: 'notification',
      notification,
    });

    // 3. Web Push
    try {
      await this.pushService.sendToUser(userId, {
        title,
        body: stripHtml(message),
        url: `/groups/${groupId}`,
      });
    } catch (err) {
      this.logger.warn(
        `Push send failed for user ${userId}: ${this.errMsg(err)}`,
      );
    }

    // 4. Telegram
    if (telegramChatId) {
      try {
        const bot = this.telegramService.getBot();
        if (bot) {
          await bot.telegram.sendMessage(telegramChatId, message, {
            parse_mode: 'HTML',
          });
        }
      } catch (err) {
        this.logger.warn(
          `Telegram send failed for user ${userId}: ${this.errMsg(err)}`,
        );
      }
    }
  }

  private async fetchRoomName(roomId: string): Promise<string | null> {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, deletedAt: null },
      select: { name: true },
    });
    return room?.name ?? null;
  }

  private errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}

function formatDDMMYYYY(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}.${m}.${y}`;
}

function weekdayLabel(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return WEEKDAY_LABEL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

function composeStudentText(
  p: LessonReschedulePayload,
  kind: EventKind,
): string {
  // Generic phrasing — students never see the admin's `reason` text.
  const verb = kind === 'created' ? "ko'chirildi" : 'qayta belgilandi';
  const lines: string[] = [];
  lines.push(
    `Salom! ${formatDDMMYYYY(p.originalDate)} dagi darsingiz ` +
      `ma'lum sabablarga ko'ra ${formatDDMMYYYY(p.newDate)} ga ${verb}.`,
  );
  if (p.newLessonStartTime && p.newLessonEndTime) {
    lines.push(`Vaqt: ${p.newLessonStartTime}–${p.newLessonEndTime}.`);
  }
  return lines.join('\n');
}

function composeTeacherText(
  p: LessonReschedulePayload,
  kind: EventKind,
  groupName: string,
  roomName: string | null,
): string {
  const title =
    kind === 'created'
      ? "<b>Dars ko'chirildi</b>"
      : "<b>Ko'chirilgan dars yangilandi</b>";
  const lines: string[] = [title];
  lines.push(`Guruh: ${escapeHtml(groupName)}`);
  lines.push(
    `Asl sana: ${formatDDMMYYYY(p.originalDate)} (${weekdayLabel(p.originalDate)})`,
  );
  lines.push(
    `Yangi sana: ${formatDDMMYYYY(p.newDate)} (${weekdayLabel(p.newDate)})`,
  );
  if (roomName) lines.push(`Xona: ${escapeHtml(roomName)}`);
  if (p.newLessonStartTime && p.newLessonEndTime) {
    lines.push(`Vaqt: ${p.newLessonStartTime}–${p.newLessonEndTime}`);
  }
  if (p.reason) lines.push(`Sabab: ${escapeHtml(p.reason)}`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

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
import type { LessonCancellationPayload } from './lesson-cancellations.service';

const WEEKDAY_LABEL: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

/**
 * Mirrors `LessonRescheduleEventsListener` but for cancellations:
 * teacher gets full 4-channel + reason in body; student gets a generic
 * Telegram via SmsService (no admin-side reason exposed).
 */
@Injectable()
export class LessonCancellationEventsListener {
  private readonly logger = new Logger(LessonCancellationEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private telegramService: TelegramService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  @OnEvent('lesson-cancellation.created')
  async handle(payload: LessonCancellationPayload) {
    try {
      const group = await this.prisma.group.findFirst({
        where: { id: payload.groupId, deletedAt: null },
        select: {
          id: true,
          name: true,
          teachers: {
            where: { teacher: { deletedAt: null, isActive: true } },
            select: {
              teacher: { select: { id: true, telegramChatId: true } },
            },
          },
        },
      });
      if (!group) return;

      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          groupId: payload.groupId,
          deletedAt: null,
          status: 'ACTIVE',
          student: { deletedAt: null, isActive: true },
        },
        select: { student: { select: { id: true, telegramChatId: true } } },
      });

      const studentText = composeStudentText(payload);
      const teacherTitle = 'Dars bekor qilindi';
      const teacherText = composeTeacherText(payload, group.name);

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
            payload.cancelledById,
            payload.companyId,
          );
          studentsNotified++;
        } catch (err) {
          this.logger.warn(
            `SmsService.sendToStudent failed for student ${e.student.id}: ${this.errMsg(err)}`,
          );
        }
      }

      let teachersNotified = 0;
      for (const t of group.teachers) {
        try {
          await this.deliverToTeacher(
            t.teacher.id,
            t.teacher.telegramChatId,
            teacherTitle,
            teacherText,
            payload.groupId,
            payload.companyId,
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
        entityId: payload.groupId,
        newValues: {
          action: 'TELEGRAM_XABARNOMASI_YUBORILDI',
          voqea: 'lesson-cancellation.created',
          sana: payload.date,
          oquvchilarga_yuborildi: studentsNotified,
          telegramsiz_oquvchilar: studentsMissing,
          ustozlarga_yuborildi: teachersNotified,
          matn_namunasi: studentText.slice(0, 120),
        },
        changedById: payload.cancelledById,
        companyId: payload.companyId,
      });
    } catch (err) {
      this.logger.error(
        `LessonCancellationEventsListener failed: ${this.errMsg(err)}`,
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
    const notification = await this.notificationsService.create({
      userId,
      type: NotificationType.LESSON_CANCELLED,
      title,
      message,
      relatedEntityType: 'Group',
      relatedEntityId: groupId,
      companyId,
    });
    this.gateway.sendToUser(userId, { type: 'notification', notification });
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

function composeStudentText(p: LessonCancellationPayload): string {
  // Generic — no admin-side reason exposed to students.
  return (
    `Diqqat! ${formatDDMMYYYY(p.date)} dagi darsingiz ` +
    `ma'lum sabablarga ko'ra bekor qilindi.`
  );
}

function composeTeacherText(
  p: LessonCancellationPayload,
  groupName: string,
): string {
  const lines: string[] = ['<b>Dars bekor qilindi</b>'];
  lines.push(`Guruh: ${escapeHtml(groupName)}`);
  lines.push(`Sana: ${formatDDMMYYYY(p.date)} (${weekdayLabel(p.date)})`);
  if (p.reason) lines.push(`Sabab: ${escapeHtml(p.reason)}`);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

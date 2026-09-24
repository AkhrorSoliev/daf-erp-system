import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationType,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';

export interface AttendanceCompletedPayload {
  groupId: string;
  groupName: string;
  date: string;
  teacherIds: number[];
  companyId: number;
  stats: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}

/**
 * Listens for `attendance.completed` events emitted by AttendanceService.save()
 * and notifies the group's teachers: DB row, SSE and push instantly, Telegram
 * through the 20:00 digest (ADR-0025).
 *
 * Idempotency relies on existing Notification rows for the same day — the
 * emitter only fires on the first save of the day (no prior attendance rows),
 * but this check is a backstop against duplicate events.
 */
@Injectable()
export class AttendanceEventsListener {
  private readonly logger = new Logger(AttendanceEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent('attendance.completed')
  async handleAttendanceCompleted(payload: AttendanceCompletedPayload) {
    const { groupId, groupName, date, teacherIds, companyId, stats } = payload;
    if (teacherIds.length === 0) return;

    const teachers = await this.prisma.user.findMany({
      where: {
        id: { in: teacherIds },
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, telegramChatId: true },
    });

    const title = 'Davomat qabul qilindi';
    const message = `✅ "${groupName}" davomati muvaffaqiyatli qabul qilindi. Keldi: ${stats.present} / Kelmadi: ${stats.absent} / Kechikdi: ${stats.late} / Sababli: ${stats.excused}. Rahmat!`;

    for (const teacher of teachers) {
      try {
        if (await this.alreadySent(teacher.id, groupId)) continue;

        const notification = await this.notificationsService.create({
          userId: teacher.id,
          type: NotificationType.ATTENDANCE_COMPLETED,
          title,
          message,
          relatedEntityType: 'Group',
          relatedEntityId: groupId,
          companyId,
        });

        this.gateway.sendToUser(teacher.id, {
          type: 'notification',
          notification,
        });

        try {
          await this.pushService.sendToUser(teacher.id, {
            title,
            body: message,
            url: `/groups/${groupId}`,
          });
        } catch (err) {
          this.logger.warn(
            `Push send failed for teacher ${teacher.id}: ${err instanceof Error ? err.message : err}`,
          );
        }

        // Telegram waits for the 20:00 digest (ADR-0025); DB/SSE/push above
        // stay instant. The chat is resolved at 20:00, so a teacher who links
        // Telegram later today still gets the line.
        try {
          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: teacher.id,
            companyId,
            category: TelegramDigestCategory.ATTENDANCE_COMPLETED,
            relatedEntityId: `${groupId}:${date}`,
            payload: {
              groupId,
              groupName,
              date,
              present: stats.present,
              absent: stats.absent,
              late: stats.late,
              excused: stats.excused,
            },
          });
        } catch (err) {
          this.logger.warn(
            `Attendance digest enqueue failed for teacher ${teacher.id}: ${describeError(err)}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to notify teacher ${teacher.id} about attendance completion: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async alreadySent(userId: number, groupId: string): Promise<boolean> {
    const today = this.startOfTashkentDay();
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.ATTENDANCE_COMPLETED,
        relatedEntityType: 'Group',
        relatedEntityId: groupId,
        createdAt: { gte: today },
      },
      select: { id: true },
    });
    return !!existing;
  }

  private startOfTashkentDay(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const p = (t: string) => parts.find((x) => x.type === t)!.value;
    return new Date(`${p('year')}-${p('month')}-${p('day')}T00:00:00+05:00`);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';

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
 * and sends stats notifications to the group's teachers across 4 channels.
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
    private telegramService: TelegramService,
  ) {}

  @OnEvent('attendance.completed')
  async handleAttendanceCompleted(payload: AttendanceCompletedPayload) {
    const { groupId, groupName, teacherIds, companyId, stats } = payload;
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

        if (teacher.telegramChatId) {
          try {
            const bot = this.telegramService.getBot();
            if (bot) {
              await bot.telegram.sendMessage(
                teacher.telegramChatId,
                `<b>${title}</b>\n${message}`,
                { parse_mode: 'HTML' },
              );
            }
          } catch (err) {
            this.logger.warn(
              `Telegram send failed for teacher ${teacher.id}: ${err instanceof Error ? err.message : err}`,
            );
          }
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

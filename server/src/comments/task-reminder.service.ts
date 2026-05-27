import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { HolidaysService } from '../holidays/holidays.service';

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private holidaysService: HolidaysService,
  ) {}

  // Ish vaqtida har soatda ishlaydi (08:00–18:00 Asia/Tashkent, daqiqa = 0).
  // Dushanba–shanba (yakshanba dam) va bayram kunlari ham o'tkazib yuboriladi.
  // Vazifa muddati shu deraza ichida bo'lishi shart (CommentsService.create
  // tekshiradi) — shuning uchun bu cron har bir vazifaning 1-soatlik
  // eslatmasini ushlab oladi.
  @Cron('0 0 8-18 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async checkUpcomingDeadlines() {
    // Bayram kunini o'tkazib yuborish — Holiday jadvalidagi har qanday
    // faol bayram bugungi sanani qoplasa, cron hech narsa qilmaydi.
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      new Date(),
    );
    if (holiday) {
      this.logger.debug(
        `Bayram kuni (${holiday.name}) — task reminder o'tkazib yuborildi`,
      );
      return;
    }

    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    // dueDate gacha 1 soat qolgan, DONE bo'lmagan, hali eslatma yuborilmagan topshiriqlar
    const upcomingAssignees = await this.prisma.commentAssignee.findMany({
      where: {
        status: { not: 'DONE' },
        lastRemindedAt: null,
        comment: {
          isTask: true,
          dueDate: {
            gt: now,
            lte: oneHourLater,
          },
        },
      },
      include: {
        comment: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (upcomingAssignees.length === 0) return;

    this.logger.log(
      `${upcomingAssignees.length} ta topshiriq muddati yaqinlashmoqda`,
    );

    for (const assignee of upcomingAssignees) {
      try {
        const authorName = assignee.comment.author
          ? `${assignee.comment.author.firstName} ${assignee.comment.author.lastName}`
          : "Noma'lum";

        const title = 'Topshiriq muddati yaqinlashmoqda';
        const message = `${authorName} bergan topshiriq muddati 1 soat ichida tugaydi: "${this.truncate(assignee.comment.content, 80)}"`;

        const notification = await this.notificationsService.create({
          userId: assignee.userId,
          type: NotificationType.TASK_REMINDER,
          title,
          message,
          relatedEntityType: assignee.comment.entityType,
          relatedEntityId: assignee.comment.entityId,
          commentId: assignee.comment.id,
          companyId: assignee.comment.companyId,
        });

        this.gateway.sendToUser(assignee.userId, {
          type: 'notification',
          notification,
        });

        await this.pushService.sendToUser(assignee.userId, {
          title,
          body: message,
        });

        // Qayta eslatma oldini olish
        await this.prisma.commentAssignee.update({
          where: { id: assignee.id },
          data: { lastRemindedAt: now },
        });
      } catch (error) {
        this.logger.error(
          `Reminder failed for assignee ${assignee.id}: ${error.message}`,
        );
      }
    }
  }

  private truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }
}

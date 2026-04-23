import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
  ) {}

  // Ish vaqtida har 30 daqiqada ishlaydi (08:00–22:59 Asia/Tashkent).
  // Tunda DB ni uyg'otmaslik uchun cheklangan — kechqurun yangi qo'yilgan
  // topshiriq deadline'i ertaga ertalab 08:00 dagi birinchi tekshiruvda olinadi.
  @Cron('0 */30 8-22 * * *', { timeZone: 'Asia/Tashkent' })
  async checkUpcomingDeadlines() {
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

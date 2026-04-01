import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private telegramService: TelegramService,
  ) {}

  @OnEvent('task.assigned')
  async handleTaskAssigned(payload: {
    comment: any;
    assigneeIds: number[];
  }) {
    const { comment, assigneeIds } = payload;
    const authorName = comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : 'Noma\'lum';

    // Determine entity label for notification message
    const entityLabel = this.getEntityLabel(comment.entityType, comment.entityId);

    for (const assigneeId of assigneeIds) {
      try {
        const title = 'Yangi topshiriq';
        const message = `${authorName} sizga topshiriq berdi: "${this.truncate(comment.content, 80)}"`;

        // 1. DB notification
        const notification = await this.notificationsService.create({
          userId: assigneeId,
          type: NotificationType.TASK_ASSIGNED,
          title,
          message,
          relatedEntityType: comment.entityType,
          relatedEntityId: comment.entityId,
          commentId: comment.id,
          companyId: comment.companyId,
        });

        // 2. SSE — real-time
        this.gateway.sendToUser(assigneeId, {
          type: 'notification',
          notification,
        });

        // 3. Web Push
        await this.pushService.sendToUser(assigneeId, {
          title,
          body: message,
          url: this.getEntityUrl(comment.entityType, comment.entityId),
        });

        // 4. Telegram
        await this.sendTelegram(assigneeId, title, message);
      } catch (error) {
        this.logger.error(
          `Failed to notify assignee ${assigneeId}: ${error.message}`,
        );
      }
    }
  }

  @OnEvent('task.deleted')
  async handleTaskDeleted(payload: {
    comment: any;
    assigneeIds: number[];
  }) {
    const { comment, assigneeIds } = payload;
    const authorName = comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : 'Noma\'lum';

    for (const assigneeId of assigneeIds) {
      try {
        const title = 'Topshiriq o\'chirildi';
        const message = `${authorName} topshiriqni o'chirdi: "${this.truncate(comment.content, 80)}"`;

        const notification = await this.notificationsService.create({
          userId: assigneeId,
          type: NotificationType.TASK_DELETED,
          title,
          message,
          relatedEntityType: comment.entityType,
          relatedEntityId: comment.entityId,
          companyId: comment.companyId,
        });

        this.gateway.sendToUser(assigneeId, { type: 'notification', notification });

        await this.pushService.sendToUser(assigneeId, {
          title,
          body: message,
          url: this.getEntityUrl(comment.entityType, comment.entityId),
        });

        await this.sendTelegram(assigneeId, title, message);
      } catch (error) {
        this.logger.error(`Failed to notify assignee ${assigneeId} about task deletion: ${error.message}`);
      }
    }
  }

  @OnEvent('task.updated')
  async handleTaskUpdated(payload: {
    comment: any;
    assigneeIds: number[];
  }) {
    const { comment, assigneeIds } = payload;
    const authorName = comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : 'Noma\'lum';

    for (const assigneeId of assigneeIds) {
      try {
        const title = 'Topshiriq yangilandi';
        const message = `${authorName} topshiriqni yangiladi: "${this.truncate(comment.content, 80)}"`;

        const notification = await this.notificationsService.create({
          userId: assigneeId,
          type: NotificationType.TASK_UPDATED,
          title,
          message,
          relatedEntityType: comment.entityType,
          relatedEntityId: comment.entityId,
          commentId: comment.id,
          companyId: comment.companyId,
        });

        this.gateway.sendToUser(assigneeId, { type: 'notification', notification });

        await this.pushService.sendToUser(assigneeId, {
          title,
          body: message,
          url: this.getEntityUrl(comment.entityType, comment.entityId),
        });

        await this.sendTelegram(assigneeId, title, message);
      } catch (error) {
        this.logger.error(`Failed to notify assignee ${assigneeId} about task update: ${error.message}`);
      }
    }
  }

  @OnEvent('task.status.changed')
  async handleTaskStatusChanged(payload: {
    comment: any;
    assignee: any;
    newStatus: string;
  }) {
    const { comment, assignee, newStatus } = payload;
    const statusLabel =
      newStatus === 'SEEN' ? "ko'rdi" : newStatus === 'DONE' ? 'bajardi' : newStatus;
    const assigneeName = assignee.user ? `${assignee.user.firstName} ${assignee.user.lastName}` : 'Noma\'lum';

    const title = 'Topshiriq yangilandi';
    const message = `${assigneeName} topshiriqni ${statusLabel}: "${this.truncate(comment.content, 60)}"`;

    try {
      // Notify comment author
      const notification = await this.notificationsService.create({
        userId: comment.authorId,
        type: NotificationType.TASK_STATUS_CHANGED,
        title,
        message,
        relatedEntityType: comment.entityType,
        relatedEntityId: comment.entityId,
        commentId: comment.id,
        companyId: comment.companyId,
      });

      this.gateway.sendToUser(comment.authorId, {
        type: 'notification',
        notification,
      });

      await this.pushService.sendToUser(comment.authorId, {
        title,
        body: message,
        url: this.getEntityUrl(comment.entityType, comment.entityId),
      });

      await this.sendTelegram(comment.authorId, title, message);
    } catch (error) {
      this.logger.error(
        `Failed to notify author ${comment.authorId}: ${error.message}`,
      );
    }
  }

  private async sendTelegram(userId: number, title: string, message: string) {
    try {
      const bot = this.telegramService.getBot();
      if (!bot) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramChatId: true },
      });

      if (!user?.telegramChatId) return;

      const text = `<b>${title}</b>\n${message}`;
      await bot.telegram.sendMessage(user.telegramChatId, text, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.warn(`Telegram send failed for user ${userId}: ${error.message}`);
    }
  }

  private truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  private getEntityLabel(entityType: string, entityId: string): string {
    return `${entityType} #${entityId}`;
  }

  private getEntityUrl(entityType: string, entityId: string): string {
    const routes: Record<string, string> = {
      Student: `/students/${entityId}`,
      User: `/teachers/${entityId}`,
    };
    return routes[entityType] || '/';
  }
}

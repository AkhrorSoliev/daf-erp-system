import { Injectable } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NOTIFICATION_GROUP,
  notificationKind,
  type NotificationGroup,
} from './notification-kind';

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  commentId?: string;
  taskId?: string;
  companyId: number;
  /**
   * Overrides the type's default (`ACTION_TYPES`). Only the task plan passes
   * it: a watcher's TASK_ASSIGNED is information, a returned task waits.
   */
  actionRequired?: boolean;
}

/** A row as the API and SSE serve it: with the bell's group. */
export type NotificationView = Notification & { group: NotificationGroup };

export function toNotificationView(row: Notification): NotificationView {
  return { ...row, group: NOTIFICATION_GROUP[row.type] };
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** The one writer of Notification rows: every sender comes through here. */
  async create(params: CreateNotificationParams): Promise<NotificationView> {
    const kind = notificationKind(
      params.type,
      new Date(),
      params.actionRequired,
    );
    const row = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        commentId: params.commentId,
        taskId: params.taskId,
        companyId: params.companyId,
        actionRequired: kind.actionRequired,
        groupKey: kind.groupKey,
      },
    });
    return toNotificationView(row);
  }

  async findByUser(userId: number, query: NotificationQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return { data, total, page, pageSize };
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, userId: number) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { message: "Bildirishnoma o'qilgan deb belgilandi" };
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: "Barcha bildirishnomalar o'qilgan deb belgilandi" };
  }

  async registerPush(
    userId: number,
    endpoint: string,
    p256dh: string,
    auth: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh, auth },
      create: { userId, endpoint, p256dh, auth },
    });
  }

  async unregisterPush(userId: number, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { message: 'Bildirishnoma obunasi olib tashlandi' };
  }

  /** Register / refresh a native (Expo) push token for the student app. */
  async registerDevice(
    userId: number,
    token: string,
    platform?: string,
    appVersion?: string,
  ) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform, appVersion, lastSeenAt: new Date() },
      create: { userId, token, platform, appVersion },
    });
  }

  async unregisterDevice(userId: number, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { message: "Qurilma o'chirildi" };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cursorWhere, decodeCursor, encodeCursor } from '../tasks/task-cursor';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NOTIFICATION_GROUP,
  NOTIFICATION_GROUPS,
  notificationKind,
  TYPES_BY_GROUP,
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

export interface NotificationCounts {
  /** Waits for the user (read or not): the «Kutilmoqda» list. */
  pending: number;
  all: number;
  groups: Record<NotificationGroup, number>;
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

  async findByUser(
    userId: number,
    query: NotificationQueryDto,
  ): Promise<{ data: NotificationView[]; nextCursor: string | null }> {
    const pageSize = query.pageSize ?? 20;
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new BadRequestException("Sahifa belgisi noto'g'ri");
    }
    const q = query.q?.trim();

    const and: Prisma.NotificationWhereInput[] = [{ userId }];
    if (query.filter === 'pending') {
      and.push({ actionRequired: true, resolvedAt: null });
    }
    if (query.type) and.push({ type: { in: TYPES_BY_GROUP[query.type] } });
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { message: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (cursor) and.push(cursorWhere(cursor));

    const rows = await this.prisma.notification.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    return {
      data: page.map(toNotificationView),
      nextCursor:
        rows.length > pageSize ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  /** The badge (spec §8): waits for the user, not yet done, not yet read. */
  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, actionRequired: true, resolvedAt: null, isRead: false },
    });
    return { count };
  }

  /** The page's left list. */
  async getCounts(userId: number): Promise<NotificationCounts> {
    const [byType, pending] = await Promise.all([
      this.prisma.notification.groupBy({
        by: ['type'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.notification.count({
        where: { userId, actionRequired: true, resolvedAt: null },
      }),
    ]);
    const groups = Object.fromEntries(
      NOTIFICATION_GROUPS.map((g) => [g, 0]),
    ) as Record<NotificationGroup, number>;
    let all = 0;
    for (const row of byType) {
      groups[NOTIFICATION_GROUP[row.type]] += row._count._all;
      all += row._count._all;
    }
    return { pending, all, groups };
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

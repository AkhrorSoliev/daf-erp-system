import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TASK_EVENTS, type TaskEventTask } from './task-events';
import { planNotices } from './task-notify-plan';

/** Bell + SSE + push for every task event. Telegram joins in phase 2. */
@Injectable()
export class TaskNotifyListener {
  private readonly logger = new Logger(TaskNotifyListener.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private push: PushService,
  ) {}

  @OnEvent(TASK_EVENTS.ASSIGNED)
  onAssigned(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.ASSIGNED, p);
  }
  @OnEvent(TASK_EVENTS.UNASSIGNED)
  onUnassigned(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.UNASSIGNED, p);
  }
  @OnEvent(TASK_EVENTS.STATUS_CHANGED)
  onStatus(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.STATUS_CHANGED, p);
  }
  @OnEvent(TASK_EVENTS.REVIEW_REQUESTED)
  onReview(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.REVIEW_REQUESTED, p);
  }
  @OnEvent(TASK_EVENTS.REVIEWED)
  onReviewed(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.REVIEWED, p);
  }
  @OnEvent(TASK_EVENTS.COMMENTED)
  onCommented(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.COMMENTED, p);
  }
  @OnEvent(TASK_EVENTS.CANCELLED)
  onCancelled(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.CANCELLED, p);
  }
  @OnEvent(TASK_EVENTS.REASSIGNED)
  onReassigned(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.REASSIGNED, p);
  }
  @OnEvent(TASK_EVENTS.DUE_CHANGED)
  onDue(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.DUE_CHANGED, p);
  }

  private async handle(event: string, payload: { task: TaskEventTask }) {
    try {
      const task = payload.task;
      const ids = [
        ...new Set([
          ...(task.authorId !== null ? [task.authorId] : []),
          ...task.participants.map((p) => p.userId),
          ...extraIds(payload),
        ]),
      ];
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          isActive: true,
          status: UserStatus.ACTIVE,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      const names = new Map(
        users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
      );
      const active = new Set(users.map((u) => u.id));
      for (const n of planNotices(event, payload, names)) {
        if (!active.has(n.userId)) continue;
        const notification = await this.notifications.create({
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          relatedEntityType: 'Task',
          relatedEntityId: task.id,
          taskId: task.id,
          companyId: task.companyId,
        });
        this.gateway.sendToUser(n.userId, {
          type: 'notification',
          notification,
        });
        await this.push.sendToUser(n.userId, {
          title: n.title,
          body: n.message,
          url: `/tasks?task=${task.id}`,
        });
      }
      for (const uid of ids) {
        this.gateway.sendToUser(uid, { type: 'task.updated', taskId: task.id });
      }
    } catch (error) {
      this.logger.error(
        `task notify failed (${event}): ${(error as Error).message}`,
      );
    }
  }
}

function extraIds(p: unknown): number[] {
  const x = p as {
    userIds?: number[];
    toUserIds?: number[];
    fromUserId?: number;
  };
  return [
    ...(x.userIds ?? []),
    ...(x.toUserIds ?? []),
    ...(x.fromUserId !== undefined ? [x.fromUserId] : []),
  ];
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { OPEN_STATUSES } from './task-transitions';

type Db = PrismaService | Prisma.TransactionClient;
const REMINDER_LEAD_MS = 60 * 60 * 1000;

export interface OutboxTask {
  id: string;
  dueAt: Date | null;
  authorId: number | null;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
}

/**
 * (Re)writes the time-based rows for a task. A free function so a plain writer
 * with no Nest instance (the «Dars bo'ldimi?» task) can schedule too; the
 * service method delegates here.
 */
export async function scheduleTaskOutbox(
  db: Db,
  task: OutboxTask,
): Promise<void> {
  // Sent rows go too: the unique key (task, user, channel, kind) would make
  // createMany skip a new OVERDUE after a deadline moved past an old one.
  // A sent row's sendAfter is in the past, so it is never written again.
  await db.taskOutbox.deleteMany({ where: { taskId: task.id } });
  const dueAt = task.dueAt;
  if (!dueAt) return;
  const assignees = task.participants
    .filter((p) => p.role === 'ASSIGNEE')
    .map((p) => p.userId);
  const overdueTo = [
    ...new Set([
      ...assignees,
      ...(task.authorId !== null ? [task.authorId] : []),
    ]),
  ];
  const rows = [
    ...assignees.map((userId) => ({
      taskId: task.id,
      userId,
      channel: 'INAPP' as const,
      kind: 'REMINDER' as const,
      sendAfter: new Date(dueAt.getTime() - REMINDER_LEAD_MS),
    })),
    ...overdueTo.map((userId) => ({
      taskId: task.id,
      userId,
      channel: 'INAPP' as const,
      kind: 'OVERDUE' as const,
      sendAfter: dueAt,
    })),
  ].filter((r) => r.sendAfter.getTime() > Date.now());
  if (rows.length) {
    await db.taskOutbox.createMany({ data: rows, skipDuplicates: true });
  }
}

@Injectable()
export class TaskOutboxService {
  private readonly logger = new Logger(TaskOutboxService.name);
  /** A slow run must not be picked up again by the next tick and double-send. */
  private draining = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private push: PushService,
  ) {}

  /** (Re)writes the time-based rows for a task; called on create, participant and due changes. */
  schedule(db: Db, task: OutboxTask): Promise<void> {
    return scheduleTaskOutbox(db, task);
  }

  @Cron('0 * * * * *', { timeZone: 'Asia/Tashkent' })
  async drain(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    try {
      return await this.drainDue();
    } finally {
      this.draining = false;
    }
  }

  private async drainDue(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.taskOutbox.findMany({
      where: {
        channel: 'INAPP',
        sendAfter: { lte: now },
        sentAt: null,
        attempts: { lt: 3 },
      },
      take: 100,
      orderBy: { sendAfter: 'asc' },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            companyId: true,
            author: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (due.length === 0) return 0;
    // TaskOutbox carries a bare userId (no relation), so the recipients load apart.
    const live = new Set(
      (
        await this.prisma.user.findMany({
          where: {
            id: { in: [...new Set(due.map((r) => r.userId))] },
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).map((u) => u.id),
    );
    let sent = 0;
    for (const row of due) {
      const open = OPEN_STATUSES.includes(row.task.status);
      const alive = live.has(row.userId);
      if (!open || !alive) {
        await this.prisma.taskOutbox.update({
          where: { id: row.id },
          data: {
            sentAt: now,
            lastError: open ? 'user inactive' : 'task closed',
          },
        });
        continue;
      }
      // The OVERDUE row covers a deadline that has already passed.
      if (
        row.kind === 'REMINDER' &&
        (!row.task.dueAt || row.task.dueAt.getTime() <= now.getTime())
      ) {
        await this.prisma.taskOutbox.update({
          where: { id: row.id },
          data: { sentAt: now, lastError: 'stale reminder' },
        });
        continue;
      }
      try {
        const author = row.task.author
          ? `${row.task.author.firstName} ${row.task.author.lastName}`
          : 'Tizim';
        const [type, title, message] =
          row.kind === 'REMINDER'
            ? ([
                'TASK_REMINDER',
                '1 soatdan keyin muddat tugaydi',
                `${author} bergan topshiriq: «${row.task.title}»`,
              ] as const)
            : ([
                'TASK_OVERDUE',
                "Muddati o'tdi",
                `«${row.task.title}»`,
              ] as const);
        const notification = await this.notifications.create({
          userId: row.userId,
          type,
          title,
          message,
          relatedEntityType: 'Task',
          relatedEntityId: row.task.id,
          taskId: row.task.id,
          companyId: row.task.companyId,
        });
        this.gateway.sendToUser(row.userId, {
          type: 'notification',
          notification,
        });
        await this.push.sendToUser(row.userId, {
          title,
          body: message,
          url: `/tasks?task=${row.task.id}`,
        });
        await this.prisma.taskOutbox.update({
          where: { id: row.id },
          data: { sentAt: new Date() },
        });
        sent++;
      } catch (error) {
        await this.prisma.taskOutbox.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            lastError: (error as Error).message.slice(0, 500),
          },
        });
        this.logger.warn(
          `outbox ${row.id} failed: ${(error as Error).message}`,
        );
      }
    }
    return sent;
  }
}

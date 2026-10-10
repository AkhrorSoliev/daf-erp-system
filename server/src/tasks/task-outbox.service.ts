import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, TaskKind, TaskPriority, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { OPEN_STATUSES } from './task-transitions';
import { telegramSendAfter } from './task-quiet-hours';

type Db = PrismaService | Prisma.TransactionClient;
const REMINDER_LEAD_MS = 60 * 60 * 1000;
const SENT_KEEP_MS = 30 * 24 * 3600_000;

export interface OutboxTask {
  id: string;
  kind: TaskKind;
  priority: TaskPriority;
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
  // Sent time rows go too, so a deadline moved past an old one notifies
  // again. Telegram notices queued for the morning (NOTICE) are not time
  // rows and stay.
  await db.taskOutbox.deleteMany({
    where: { taskId: task.id, kind: { in: ['REMINDER', 'OVERDUE'] } },
  });
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
  const now = Date.now();
  const due = [
    ...assignees.map((userId) => ({
      userId,
      kind: 'REMINDER' as const,
      at: new Date(dueAt.getTime() - REMINDER_LEAD_MS),
    })),
    ...overdueTo.map((userId) => ({
      userId,
      kind: 'OVERDUE' as const,
      at: dueAt,
    })),
  ];
  // «Dars bo'ldimi?» never goes to Telegram (spec §6.1): the lesson-end
  // message already covers it.
  const toTelegram = task.kind !== 'LESSON_QUESTION';
  const rows = [
    // In-app rows are judged by their own time: a past one was already sent
    // by the minute drain.
    ...due
      .filter((r) => r.at.getTime() > now)
      .map((r) => ({
        taskId: task.id,
        userId: r.userId,
        channel: 'INAPP' as const,
        kind: r.kind,
        sendAfter: r.at,
      })),
    // Telegram rows are judged by the SHIFTED time. A notice whose own time
    // fell in the night is held for 08:00; this rewrite deleted that row, so
    // it is rebuilt until 08:00 has passed. The night shift is decided now;
    // the drain only looks at sendAfter.
    ...(toTelegram
      ? due.flatMap((r) => {
          const sendAfter = telegramSendAfter(r.at, task.priority);
          if (sendAfter.getTime() <= now) return [];
          // A reminder that would go out together with, or after, the overdue
          // notice (due 08:00, reminder 07:00 held to 08:00) says nothing new.
          if (r.kind === 'REMINDER' && sendAfter.getTime() >= dueAt.getTime()) {
            return [];
          }
          return [
            {
              taskId: task.id,
              userId: r.userId,
              channel: 'TELEGRAM' as const,
              kind: r.kind,
              sendAfter,
            },
          ];
        })
      : []),
  ];
  // skipDuplicates leans on the partial unique index TaskOutbox_time_row_key
  // (REMINDER / OVERDUE rows, one per task, person, channel and kind).
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

  /**
   * (Re)writes the time-based rows (in-app and Telegram) for a task; called on
   * create and on participant, due-date and priority changes.
   */
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

  /** Spec §9.6: sent rows, and rows that failed three times, go after 30 days. */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async purge(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - SENT_KEEP_MS);
    const { count } = await this.prisma.taskOutbox.deleteMany({
      where: {
        OR: [
          { sentAt: { lt: before } },
          { sentAt: null, attempts: { gte: 3 }, createdAt: { lt: before } },
        ],
      },
    });
    return count;
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

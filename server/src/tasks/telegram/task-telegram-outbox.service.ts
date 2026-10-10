import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma, TaskOutboxKind, TaskPriority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../telegram-digest/telegram-send';
import type { TgNotice } from '../task-notify-plan';
import { telegramSendAfter } from '../task-quiet-hours';
import { OPEN_STATUSES } from '../task-transitions';
import type { TgTaskView } from './task-telegram-text';
import { loadTaskView } from './task-telegram-view';
import {
  BOT_OFF,
  TRANSIENT_RETRY_S,
  TaskTelegramSender,
  type TgSendResult,
} from './task-telegram.sender';

/** `attempts` of a row the drain gives up on (the `attempts < 3` filter and the 03:00 purge). */
const DEAD = 3;
/** How long a row a run has picked up stays out of every other run's reach. */
const CLAIM_MS = 5 * 60_000;

interface DueRow {
  id: string;
  taskId: string;
  userId: number;
  kind: TaskOutboxKind;
  payload: Prisma.JsonValue;
  attempts: number;
}

/** What goes into `lastError`: always through `describeError`, so no bot token. */
const note = (reason: unknown) => describeError(reason).slice(0, 500);

/** A retry never lands in the night quiet (an URGENT task's may). */
const retryAt = (now: Date, seconds: number, priority: TaskPriority) =>
  telegramSendAfter(new Date(now.getTime() + seconds * 1000), priority);

/** 60 s, 2 min, 4 min: a row that keeps failing is not hammered once a minute. */
const backoffSeconds = (attempts: number) => TRANSIENT_RETRY_S * 2 ** attempts;

/**
 * Why a due Telegram row is closed without a send, or null to send it.
 * NOTICE rows go whatever the task's state (a «Bekor qilindi» is about a
 * closed task); REMINDER / OVERDUE only while the task is open and the person
 * is still on it (spec §9.3).
 */
export function skipReason(
  row: { kind: TaskOutboxKind; userId: number },
  view: TgTaskView | null,
  now: Date,
): string | null {
  if (!view) return 'task gone';
  if (view.kind === 'LESSON_QUESTION') return 'no telegram';
  if (row.kind === 'NOTICE') return null;
  if (!OPEN_STATUSES.includes(view.status)) return 'task closed';
  const assignee = view.participants.some(
    (p) => p.userId === row.userId && p.role === 'ASSIGNEE',
  );
  if (row.kind === 'REMINDER') {
    if (!assignee) return 'not on task';
    // The overdue row covers a deadline that has already passed.
    if (!view.dueAt || view.dueAt.getTime() <= now.getTime()) {
      return 'stale reminder';
    }
    return null;
  }
  return assignee || view.authorId === row.userId ? null : 'not on task';
}

/**
 * Sends the `TELEGRAM` rows of `TaskOutbox` when their time comes (ADR-0077).
 * A row ends in one of three ways: sent or closed (`sentAt` set), dead
 * (`attempts = 3`), or moved to a later `sendAfter`. Closed and dead rows are
 * removed by the 03:00 purge of `TaskOutboxService`.
 *
 * The cron is skipped with `CRONS_ENABLED=false` like every other: that flag
 * keeps `ScheduleModule` itself from loading (app.module.ts).
 */
@Injectable()
export class TaskTelegramOutbox {
  private readonly logger = new Logger(TaskTelegramOutbox.name);
  /** A slow run must not be picked up again by the next tick and double-send. */
  private draining = false;

  constructor(
    private prisma: PrismaService,
    private sender: TaskTelegramSender,
  ) {}

  // Second 30: half a minute away from the in-app drain.
  @Cron('30 * * * * *', { timeZone: 'Asia/Tashkent' })
  async drain(now = new Date()): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    try {
      return await this.drainDue(now);
    } finally {
      this.draining = false;
    }
  }

  private async drainDue(now: Date): Promise<number> {
    const rows = await this.prisma.taskOutbox.findMany({
      where: {
        channel: 'TELEGRAM',
        sendAfter: { lte: now },
        sentAt: null,
        attempts: { lt: DEAD },
      },
      // Notices queued together share one sendAfter (08:00): createdAt keeps
      // their queue order, id makes ties deterministic (ids are uuids).
      orderBy: [{ sendAfter: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        taskId: true,
        userId: true,
        kind: true,
        payload: true,
        attempts: true,
      },
    });
    let sent = 0;
    for (const row of rows) {
      const outcome = await this.handle(row, now);
      if (outcome === 'sent') sent++;
      // 429: the next rows would only hit the limit too.
      if (outcome === 'limited') break;
    }
    return sent;
  }

  private async handle(
    row: DueRow,
    now: Date,
  ): Promise<'sent' | 'done' | 'limited'> {
    let priority: TaskPriority = 'MEDIUM';
    let delivered = false;
    try {
      // Claim the row first: an old and a new instance (a Railway deploy runs
      // both for a while) read the same rows, and only one may send each. If
      // this run dies before it closes the row, it comes back after CLAIM_MS.
      const claim = await this.prisma.taskOutbox.updateMany({
        where: { id: row.id, sentAt: null, sendAfter: { lte: now } },
        data: { sendAfter: new Date(now.getTime() + CLAIM_MS) },
      });
      if (claim.count === 0) return 'done';

      const view = await loadTaskView(this.prisma, row.taskId);
      const skip = skipReason(row, view, now);
      if (skip !== null || !view) {
        await this.drop(row, now, skip ?? 'task gone');
        return 'done';
      }
      priority = view.priority;
      // The claim window can run past 22:00 (a run that died, then came back):
      // the night quiet holds at send time too.
      const quietUntil = telegramSendAfter(now, priority);
      if (quietUntil.getTime() > now.getTime()) {
        await this.mark(row.id, { sendAfter: quietUntil });
        return 'done';
      }
      const notice: TgNotice =
        row.kind === 'NOTICE'
          ? (row.payload as unknown as TgNotice)
          : { kind: row.kind };
      const r = await this.sender.send(view, row.userId, notice);
      if (r.status === 'sent') {
        delivered = true;
        await this.close(row.id, now, null);
        return 'sent';
      }
      if (r.status === 'skipped') {
        // No bot token will not heal by itself; no chat is closed like a send.
        if (r.reason === BOT_OFF) await this.kill(row, r.reason);
        else await this.drop(row, now, r.reason);
        return 'done';
      }
      return await this.failed(row, priority, r, now);
    } catch (err) {
      if (delivered) {
        // The message is out, only the bookkeeping failed: not a failed send,
        // so no attempt and no backoff. The claim holds the row for CLAIM_MS.
        this.logger.error(
          `telegram outbox ${row.id}: sent but not closed: ${note(err)}`,
        );
        return 'sent';
      }
      const reason = note(err);
      this.logger.warn(`telegram outbox ${row.id} failed: ${reason}`);
      try {
        await this.retry(row, priority, now, reason);
      } catch (writeErr) {
        this.logger.error(
          `telegram outbox ${row.id}: could not record the failure: ${note(writeErr)}`,
        );
      }
      return 'done';
    }
  }

  private async failed(
    row: DueRow,
    priority: TaskPriority,
    r: Extract<TgSendResult, { status: 'failed' }>,
    now: Date,
  ): Promise<'done' | 'limited'> {
    if (r.kind === 'content') {
      // Our own bug (bad HTML or URL): the same text fails again, so no retry.
      await this.kill(row, r.reason, 'error');
      return 'done';
    }
    if (r.kind === 'permanent') {
      await this.kill(row, r.reason);
      return 'done';
    }
    if (r.retryAfter !== null) {
      // 429: wait as told; it is not the row's fault, so no attempt is counted.
      await this.mark(row.id, {
        sendAfter: retryAt(now, r.retryAfter, priority),
        lastError: note(r.reason),
      });
      return 'limited';
    }
    await this.retry(row, priority, now, note(r.reason));
    return 'done';
  }

  /** A failure that may heal: counts an attempt and tries later; the third one kills the row. */
  private async retry(
    row: DueRow,
    priority: TaskPriority,
    now: Date,
    reason: string,
  ) {
    await this.mark(row.id, {
      attempts: { increment: 1 },
      sendAfter: retryAt(now, backoffSeconds(row.attempts), priority),
      lastError: reason,
    });
    if (row.attempts + 1 >= DEAD) {
      this.logger.warn(
        `telegram outbox ${row.id}: notice to ${row.userId} dead after ${DEAD} failures: ${reason}`,
      );
    }
  }

  private mark(id: string, data: Prisma.TaskOutboxUpdateInput) {
    return this.prisma.taskOutbox.update({ where: { id }, data });
  }

  private close(id: string, now: Date, reason: string | null) {
    return this.mark(id, {
      sentAt: now,
      lastError: reason === null ? null : note(reason),
    });
  }

  /** A row the drain will never send (task closed, no chat, ...): closed for good, and said so. */
  private async drop(row: DueRow, now: Date, reason: string) {
    await this.close(row.id, now, reason);
    this.logger.warn(
      `telegram outbox ${row.id}: notice to ${row.userId} dropped: ${note(reason)}`,
    );
  }

  /**
   * Never sent, never retried: the 03:00 purge removes it after 30 days. The
   * level is the caller's: `error` for our own bug (a malformed message).
   */
  private async kill(
    row: DueRow,
    reason: string,
    level: 'warn' | 'error' = 'warn',
  ) {
    await this.mark(row.id, { attempts: DEAD, lastError: note(reason) });
    this.logger[level](
      `telegram outbox ${row.id}: notice to ${row.userId} dead: ${note(reason)}`,
    );
  }
}

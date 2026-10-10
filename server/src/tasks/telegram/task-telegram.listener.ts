import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../telegram-digest/telegram-send';
import { TASK_EVENTS, type TaskEventTask } from '../task-events';
import { noticeUserIds, planNotices, type TgNotice } from '../task-notify-plan';
import { telegramSendAfter } from '../task-quiet-hours';
import { shortName, type TgTaskView } from './task-telegram-text';
import { loadTaskView, staffChatOf } from './task-telegram-view';
import { TRANSIENT_RETRY_S, TaskTelegramSender } from './task-telegram.sender';

/**
 * Task notices to Telegram, right after the commit (ADR-0078). Who hears what
 * comes from the same plan as the bell (`task-notify-plan.ts`). Inside the
 * night quiet, or after a transient failure, the notice is written to
 * `TaskOutbox` (`TELEGRAM`, `NOTICE`) and `TaskTelegramOutbox` sends it later.
 *
 * `handle` never rejects: a Telegram or database error is logged and costs
 * only that recipient's message, never another `task.*` listener's work.
 */
@Injectable()
export class TaskTelegramListener {
  private readonly logger = new Logger(TaskTelegramListener.name);

  constructor(
    private prisma: PrismaService,
    private sender: TaskTelegramSender,
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

  async handle(
    event: string,
    payload: { task: TaskEventTask },
    now = new Date(),
  ): Promise<void> {
    try {
      // «Dars bo'ldimi?» never goes to Telegram (the plan says so too).
      if (payload.task.kind === 'LESSON_QUESTION') return;
      const users = await this.prisma.user.findMany({
        where: { id: { in: noticeUserIds(payload) } },
        select: { id: true, firstName: true, lastName: true },
      });
      const names = new Map(
        users.map((u) => [u.id, shortName(u.firstName, u.lastName)]),
      );
      const out = planNotices(event, payload, names).flatMap((n) =>
        n.telegram ? [{ userId: n.userId, notice: n.telegram }] : [],
      );
      if (out.length === 0) return;
      const view = await loadTaskView(this.prisma, payload.task.id);
      if (!view) return;
      for (const { userId, notice } of out) {
        // One failing recipient must not cost the others their message.
        try {
          await this.deliver(view, userId, notice, now);
        } catch (err) {
          this.logger.error(
            `task ${view.id}: telegram notice to ${userId} failed (${event}): ${describeError(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `task ${payload?.task?.id}: telegram notices failed (${event}): ${describeError(err)}`,
      );
    }
  }

  private async deliver(
    view: TgTaskView,
    userId: number,
    notice: TgNotice,
    now: Date,
  ): Promise<void> {
    const at = telegramSendAfter(now, view.priority);
    if (at.getTime() > now.getTime()) {
      // Night: hold it for the morning, but only for somebody the message can
      // reach then (a linked, active chat of their own).
      if (await staffChatOf(this.prisma, userId)) {
        await this.queue(view.id, userId, notice, at, null);
      }
      return;
    }
    const r = await this.sender.send(view, userId, notice);
    if (r.status !== 'failed') return;
    if (r.kind === 'content') {
      // Our own bug (bad HTML or URL): the same text fails again, so no retry.
      this.logger.error(
        `task ${view.id}: telegram notice to ${userId} is malformed: ${r.reason}`,
      );
      return;
    }
    if (r.kind === 'permanent') {
      this.logger.warn(
        `task ${view.id}: telegram notice to ${userId} dropped: ${r.reason}`,
      );
      return;
    }
    const retry = new Date(
      now.getTime() + (r.retryAfter ?? TRANSIENT_RETRY_S) * 1000,
    );
    await this.queue(
      view.id,
      userId,
      notice,
      telegramSendAfter(retry, view.priority),
      r.reason,
    );
  }

  private async queue(
    taskId: string,
    userId: number,
    notice: TgNotice,
    sendAfter: Date,
    error: string | null,
  ): Promise<void> {
    await this.prisma.taskOutbox.create({
      data: {
        taskId,
        userId,
        channel: 'TELEGRAM',
        kind: 'NOTICE',
        payload: notice as Prisma.InputJsonValue,
        sendAfter,
        attempts: error ? 1 : 0,
        lastError: error,
      },
    });
  }
}

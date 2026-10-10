import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TaskTelegramPurpose } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import {
  classifyTelegramError,
  describeError,
  type TelegramFailureKind,
} from '../../telegram-digest/telegram-send';
import type { TgNotice } from '../task-notify-plan';
import {
  messageExtra,
  renderTaskMessage,
  type TgTaskView,
} from './task-telegram-text';
import { staffChatOf, taskOpenUrl } from './task-telegram-view';

/** A transient failure with no `retry_after` is tried again after this long. */
export const TRANSIENT_RETRY_S = 60;

/** The `skipped` reason of a bot that never started; the outbox kills such rows. */
export const BOT_OFF = 'bot off';

export type TgSendResult =
  | { status: 'sent'; messageId: number }
  | { status: 'skipped'; reason: string }
  | {
      status: 'failed';
      kind: TelegramFailureKind;
      retryAfter: number | null;
      reason: string;
    };

/**
 * The one place a task notice is sent (ADR-0077): the main bot, HTML, the
 * task's buttons, and a `TaskTelegramMessage` row so a reply finds its task.
 * It does not decide WHEN (listener, outbox) and never retries itself.
 */
@Injectable()
export class TaskTelegramSender {
  private readonly logger = new Logger(TaskTelegramSender.name);
  private readonly studentMiniAppUrl: string | undefined;

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    config: ConfigService,
  ) {
    this.studentMiniAppUrl =
      config.get<string>('TELEGRAM_MINI_APP_URL')?.trim() || undefined;
  }

  openUrl(roleIds: number[], taskId: string): string | undefined {
    return taskOpenUrl(this.studentMiniAppUrl, roleIds, taskId);
  }

  async send(
    view: TgTaskView,
    userId: number,
    notice: TgNotice,
  ): Promise<TgSendResult> {
    // No TELEGRAM_BOT_TOKEN: the bot never started.
    const client = this.telegram.getBot()?.telegram;
    if (!client) return { status: 'skipped', reason: BOT_OFF };
    const chat = await staffChatOf(this.prisma, userId);
    if (!chat) return { status: 'skipped', reason: 'no chat' };
    const msg = renderTaskMessage(view, notice, userId, {
      now: new Date(),
      openUrl: this.openUrl(chat.roleIds, view.id),
    });
    let messageId: number;
    try {
      const sent = await client.sendMessage(
        chat.chatId,
        msg.text,
        messageExtra(msg.buttons),
      );
      messageId = sent.message_id;
    } catch (err) {
      const f = classifyTelegramError(err);
      return {
        status: 'failed',
        kind: f.kind,
        retryAfter: f.retryAfter,
        reason: f.description.slice(0, 500),
      };
    }
    await this.record(chat.chatId, messageId, view, userId, 'NOTICE');
    return { status: 'sent', messageId };
  }

  /** The message is out: a failed bookkeeping write is logged, never thrown (no resend). */
  async record(
    chatId: string,
    messageId: number,
    task: { id: string; companyId: number },
    userId: number,
    purpose: TaskTelegramPurpose,
  ): Promise<void> {
    try {
      await this.prisma.taskTelegramMessage.create({
        data: {
          chatId,
          messageId,
          taskId: task.id,
          userId,
          purpose,
          companyId: task.companyId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `task ${task.id}: message ${messageId} sent but not recorded: ${describeError(err)}`,
      );
    }
  }
}

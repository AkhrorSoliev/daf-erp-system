import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Message } from 'telegraf/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { TasksService } from '../tasks.service';
import { lookupSeen, resolveMe } from './task-telegram-actor';
import {
  ADDED_TO_TASK,
  NOT_YOURS,
  TEXT_ONLY,
  TRY_LATER,
  returnedReply,
  shortName,
} from './task-telegram-text';

/** `/cancel` typed as a reply is still the bot's command, not a comment. */
function startsWithCommand(msg: Message): boolean {
  return (
    'entities' in msg &&
    !!msg.entities?.some((e) => e.type === 'bot_command' && e.offset === 0)
  );
}

/**
 * Replies to task messages in the main bot (spec §6.2, ADR-0078): a comment on
 * a notice, the reason on a «Qaytarish» prompt. Registered by
 * `TaskTelegramHandler` in the one composer ahead of the scenes.
 */
@Injectable()
export class TaskTelegramReplies {
  private readonly logger = new Logger(TaskTelegramReplies.name);

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
  ) {}

  /**
   * A message in a private chat (spec §6.2). Only a reply to a task message of
   * THIS chat is ours; anything else — an ordinary message, a reply to some
   * other message, a command — goes on to the scenes and the bot's own flows.
   * `next()` is called outside the `try`: a failure further down the chain is
   * not a failed reply.
   */
  async onMessage(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    let ours: boolean;
    try {
      ours = await this.handleReply(ctx);
    } catch (err) {
      this.logger.error(`task reply failed: ${describeError(err)}`);
      await ctx.reply(TRY_LATER).catch(() => undefined);
      return;
    }
    if (!ours) return next();
  }

  /** True when the message was a reply to a task message and has been answered. */
  private async handleReply(ctx: BotContext): Promise<boolean> {
    const msg = ctx.message;
    const replyTo =
      msg && 'reply_to_message' in msg ? msg.reply_to_message : undefined;
    if (
      !msg ||
      !replyTo ||
      ctx.chat?.type !== 'private' ||
      startsWithCommand(msg)
    ) {
      return false;
    }
    const chatId = String(ctx.chat.id);
    const link = await this.prisma.taskTelegramMessage.findUnique({
      where: { chatId_messageId: { chatId, messageId: replyTo.message_id } },
      select: { taskId: true, purpose: true },
    });
    if (!link) return false;
    // Photos, files and voice come with phase 3; nothing is stored now.
    const text = 'text' in msg ? msg.text.trim() : '';
    if (!text) {
      await ctx.reply(TEXT_ONLY);
      return true;
    }
    const me = await resolveMe(this.prisma, this.tasks, chatId, (t) =>
      ctx.reply(t),
    );
    if (!me) return true;
    // The same rule as for a button: the replier must be the author or on it.
    const seen = await lookupSeen(this.prisma, this.tasks, me, link.taskId);
    if (!seen) {
      await ctx.reply(NOT_YOURS);
      return true;
    }
    try {
      switch (link.purpose) {
        case 'RETURN_PROMPT': {
          const task = await this.tasks.review(
            link.taskId,
            'RETURN',
            text,
            me.actor,
          );
          await this.ack(
            ctx,
            returnedReply(
              task.assignees.map((a) => shortName(a.firstName, a.lastName)),
            ),
          );
          break;
        }
        case 'NOTICE':
          await this.tasks.addComment(link.taskId, text, me.actor);
          await this.ack(ctx, ADDED_TO_TASK);
          break;
        default:
          // PHOTO_PROMPT (phase 3) or a later purpose: give it a case above.
          this.logger.warn(
            `task ${link.taskId}: a reply to a ${link.purpose} message was not stored`,
          );
          await ctx.reply(TEXT_ONLY);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      await ctx.reply(
        err instanceof NotFoundException ? NOT_YOURS : err.message,
      );
    }
    return true;
  }

  /** The write is committed: a lost «done» message is logged, never TRY_LATER (a resend would repeat it). */
  private async ack(ctx: BotContext, text: string): Promise<void> {
    await ctx
      .reply(text)
      .catch((err) =>
        this.logger.warn(`task reply not confirmed: ${describeError(err)}`),
      );
  }
}

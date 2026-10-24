import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TaskTelegramPurpose } from '@prisma/client';
import type { Message } from 'telegraf/types';
import { PrismaService } from '../../prisma/prisma.service';
import { downloadFile } from '../../telegram/utils/download.util';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { FILE_SIZE_MESSAGE } from '../task-file-rules';
import { TaskFilesService } from '../task-files.service';
import { TasksService } from '../tasks.service';
import { lookupSeen, resolveMe, type Me } from './task-telegram-actor';
import {
  pickAttachment,
  UNSUPPORTED_MEDIA,
  type TgAttachment,
} from './task-telegram-media';
import {
  ADDED_TO_TASK,
  NOT_YOURS,
  PHOTO_PROMPT,
  PHOTO_SENT,
  PHOTO_STILL_NEEDED,
  RETURN_TEXT_ONLY,
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
    private files: TaskFilesService,
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
    const attachment = pickAttachment(msg);
    if (attachment && 'refused' in attachment) {
      await ctx.reply(attachment.refused);
      return true;
    }
    const text = 'text' in msg ? msg.text.trim() : '';
    if (!attachment && !text) {
      await ctx.reply(UNSUPPORTED_MEDIA);
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
      if (attachment) {
        await this.storeAttachment(ctx, me, link, attachment);
        return true;
      }
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
        case 'CARD':
          await this.tasks.addComment(link.taskId, text, me.actor);
          await this.ack(ctx, ADDED_TO_TASK);
          break;
        case 'PHOTO_PROMPT':
          // A text where a photo was asked for: ask again, store nothing.
          await ctx.reply(PHOTO_PROMPT);
          break;
      }
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      await ctx.reply(
        err instanceof NotFoundException ? NOT_YOURS : err.message,
      );
    }
    return true;
  }

  /**
   * A photo, document, video or voice reply (spec §6.2): downloaded from
   * Telegram (≤ 20 MB, checked before), stored like a website upload. A photo
   * answering «Rasmni … yuboring» then sends the task to review. The file link
   * carries the bot token: it lives in memory only and is never logged.
   */
  private async storeAttachment(
    ctx: BotContext,
    me: Me,
    link: { taskId: string; purpose: TaskTelegramPurpose },
    a: TgAttachment,
  ): Promise<void> {
    if (link.purpose === 'RETURN_PROMPT') {
      await ctx.reply(RETURN_TEXT_ONLY);
      return;
    }
    let href: string;
    try {
      href = (await ctx.telegram.getFileLink(a.fileId)).href;
    } catch (err) {
      // `file_size` is optional in an update: Telegram itself refuses over 20 MB.
      if (!/file is too big/i.test(describeError(err))) throw err;
      await ctx.reply(FILE_SIZE_MESSAGE);
      return;
    }
    const buffer = await downloadFile(href);
    const { file } = await this.files.upload(
      link.taskId,
      { buffer, name: a.name, durationSec: a.durationSec },
      me.actor,
    );
    const msg = ctx.message;
    const caption = msg && 'caption' in msg ? (msg.caption?.trim() ?? '') : '';
    if (caption) await this.tasks.addComment(link.taskId, caption, me.actor);
    if (link.purpose !== 'PHOTO_PROMPT') {
      return this.ack(ctx, ADDED_TO_TASK);
    }
    if (file.kind !== 'IMAGE') return this.ack(ctx, PHOTO_STILL_NEEDED);
    try {
      await this.tasks.changeStatus(link.taskId, 'IN_REVIEW', me.actor);
      await this.ack(ctx, PHOTO_SENT);
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      // The photo is saved; the move was not (already in review, returned…).
      await this.ack(ctx, `${ADDED_TO_TASK} ${err.message}`);
    }
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

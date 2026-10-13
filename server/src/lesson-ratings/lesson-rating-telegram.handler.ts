import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Composer } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import type { BotContext } from '../telegram/types/context';
import { describeError } from '../telegram-digest/telegram-send';
import {
  ALREADY_RATED,
  ASK_COMMENT,
  COMMENT_ALREADY,
  COMMENT_SAVED,
  EXPIRED,
  LOW_SCORE_MAX,
  NOT_YOURS,
  TRY_LATER,
  cleanComment,
  isWithinWindow,
  parseRatingCallback,
  thanksText,
  CONFETTI_EFFECT_ID,
} from './rating-rules';

/**
 * Baho tugmasi va «Nima yoqmadi?» javobi (spec 2026-10-13 §5.2–5.3). Sahnalardan
 * oldin ishlaydi (`useBeforeScenes`, ADR-0078 bilan bir yo'l): ochiq scene bosishni
 * yutmaydi; o'zimizniki bo'lmagan hamma narsa `next()`ga o'tadi.
 */
@Injectable()
export class LessonRatingTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LessonRatingTelegramHandler.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // TELEGRAM_BOT_TOKEN yo'q — bot o'chiq
    const c = new Composer<BotContext>();
    c.action(/^lr:/, (ctx) => this.onAction(ctx));
    c.on('message', (ctx, next) => this.onMessage(ctx, next));
    this.telegram.useBeforeScenes(c);
  }

  async onAction(ctx: BotContext, now: Date = new Date()): Promise<void> {
    try {
      await this.handleAction(ctx, now);
    } catch (err) {
      this.logger.error(`rating button failed: ${describeError(err)}`);
      await ctx.answerCbQuery(TRY_LATER).catch(() => undefined);
    }
  }

  private async handleAction(ctx: BotContext, now: Date): Promise<void> {
    const q = ctx.callbackQuery;
    const cmd = parseRatingCallback(q && 'data' in q ? q.data : '');
    if (!cmd || ctx.chat?.type !== 'private') {
      await ctx.answerCbQuery();
      return;
    }
    const row = await this.prisma.lessonRating.findUnique({
      where: { id: cmd.ratingId },
      select: { id: true, chatId: true, sentAt: true },
    });
    if (!row || row.chatId !== String(ctx.chat.id)) {
      await ctx.answerCbQuery(NOT_YOURS);
      return;
    }
    if (!isWithinWindow(row.sentAt, now)) {
      await ctx.answerCbQuery(EXPIRED);
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }
    const { count } = await this.prisma.lessonRating.updateMany({
      where: { id: row.id, score: null },
      data: { score: cmd.score, ratedAt: now },
    });
    if (count === 0) {
      await ctx.answerCbQuery(ALREADY_RATED);
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }
    await ctx.answerCbQuery();
    // Savol xabari qoladi, tugmalari olinadi; minnatdorchilik — konfetti bilan YANGI xabar.
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await this.thank(ctx, cmd.score);
    if (cmd.score <= LOW_SCORE_MAX) {
      const prompt = await ctx.reply(ASK_COMMENT, {
        reply_markup: { force_reply: true },
      });
      await this.prisma.lessonRating.update({
        where: { id: row.id },
        data: { promptMessageId: prompt.message_id },
      });
    }
  }

  /** Konfetti ishlamasa (eski mijoz, effekt rad etildi) — oddiy xabar yuboriladi. */
  private async thank(ctx: BotContext, score: number): Promise<void> {
    const text = thanksText(score);
    try {
      // @telegraf/types hali `message_effect_id`ni bilmaydi, Bot API esa qabul qiladi.
      await ctx.reply(text, { message_effect_id: CONFETTI_EFFECT_ID } as never);
    } catch {
      await ctx.reply(text).catch(() => undefined);
    }
  }

  async onMessage(
    ctx: BotContext,
    next: () => Promise<void>,
    now: Date = new Date(),
  ): Promise<void> {
    let ours: boolean;
    try {
      ours = await this.handleReply(ctx, now);
    } catch (err) {
      this.logger.error(`rating comment failed: ${describeError(err)}`);
      await ctx.reply(TRY_LATER).catch(() => undefined);
      return;
    }
    if (!ours) return next();
  }

  /** Baho so'roviga javob bo'lsa — true (javob berildi). */
  private async handleReply(ctx: BotContext, now: Date): Promise<boolean> {
    const msg = ctx.message;
    if (!msg || ctx.chat?.type !== 'private') return false;
    if (
      !('text' in msg) ||
      !('reply_to_message' in msg) ||
      !msg.reply_to_message
    ) {
      return false;
    }
    if (msg.text.startsWith('/')) return false;

    const row = await this.prisma.lessonRating.findFirst({
      where: {
        chatId: String(ctx.chat.id),
        promptMessageId: msg.reply_to_message.message_id,
      },
      select: { id: true, sentAt: true, comment: true },
    });
    if (!row) return false;
    if (!isWithinWindow(row.sentAt, now)) {
      await ctx.reply(EXPIRED);
      return true;
    }
    if (row.comment !== null) {
      await ctx.reply(COMMENT_ALREADY);
      return true;
    }
    const comment = cleanComment(msg.text);
    if (!comment) return true;
    const { count } = await this.prisma.lessonRating.updateMany({
      where: { id: row.id, comment: null },
      data: { comment, commentedAt: now },
    });
    await ctx.reply(count ? COMMENT_SAVED : COMMENT_ALREADY);
    return true;
  }
}

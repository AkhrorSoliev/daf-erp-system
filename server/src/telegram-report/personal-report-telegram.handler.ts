import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { Composer } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import type { BotContext } from '../telegram/types/context';
import { staffOfChat } from '../tasks/telegram/task-telegram-view';
import { describeError } from '../telegram-digest/telegram-send';
import { PersonalReportService } from './personal-report.service';
import { parseReportAction } from './report-keyboard';

const NOT_OPEN = 'Bu hisobot sizga ochiq emas';
const WAIT = 'Kuting…';
const SAME = "O'zgarish yo'q";
const FAILED = "Xatolik — birozdan keyin qayta urinib ko'ring";

/**
 * `tr:*` buttons of the personal report (ADR-0095) on the main bot. The chat's
 * one live staff account must have an active recipient row, and a branch must
 * be one the CEO allowed it — checked on every tap, so a forwarded message
 * opens nothing.
 */
@Injectable()
export class PersonalReportTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PersonalReportTelegramHandler.name);
  /** Chats with a tap still being answered (a quick second tap waits). */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly reports: PersonalReportService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return;
    const c = new Composer<BotContext>();
    c.action(/^tr:/, (ctx) => this.onAction(ctx));
    this.telegram.useBeforeScenes(c);
  }

  async onAction(ctx: BotContext): Promise<void> {
    const q = ctx.callbackQuery;
    const action = q && 'data' in q ? parseReportAction(q.data) : null;
    const chatId = ctx.chat ? String(ctx.chat.id) : null;
    if (!action || !chatId) {
      await ctx.answerCbQuery().catch(() => undefined);
      return;
    }
    if (this.inFlight.has(chatId)) {
      await ctx.answerCbQuery(WAIT).catch(() => undefined);
      return;
    }
    this.inFlight.add(chatId);
    try {
      const who = await staffOfChat(this.prisma, chatId);
      // One rule with the cron: the staff member must be live (ACTIVE, isActive).
      const live =
        who.kind === 'one'
          ? await this.prisma.user.findFirst({
              where: {
                id: who.userId,
                status: UserStatus.ACTIVE,
                isActive: true,
              },
              select: { id: true },
            })
          : null;
      const recipient =
        who.kind === 'one' && live
          ? await this.prisma.telegramReportRecipient.findFirst({
              where: {
                userId: who.userId,
                companyId: who.companyId,
                isActive: true,
              },
            })
          : null;
      const report = recipient
        ? await this.reports.compose(
            recipient,
            action.kind === 'open' ? 'all' : action.focus,
          )
        : null;
      if (!report) {
        await ctx.answerCbQuery(NOT_OPEN);
        // The staff menu keeps its buttons; a stale report loses them.
        if (action.kind !== 'open')
          await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        return;
      }
      const extra = { parse_mode: 'HTML' as const, ...report.keyboard };
      if (action.kind === 'open') {
        await ctx.reply(report.text, extra);
        await ctx.answerCbQuery();
        return;
      }
      try {
        await ctx.editMessageText(report.text, extra);
        await ctx.answerCbQuery();
      } catch (err) {
        if (!/message is not modified/i.test(describeError(err))) throw err;
        await ctx.answerCbQuery(SAME);
      }
    } catch (err) {
      this.logger.warn(`personal report tap failed: ${describeError(err)}`);
      await ctx.answerCbQuery(FAILED).catch(() => undefined);
    } finally {
      this.inFlight.delete(chatId);
    }
  }
}

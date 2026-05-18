import { Injectable, Logger } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupsService } from './telegram-groups.service';
import { TelegramGroupStatsService } from './telegram-group-stats.service';
import {
  MSG_APPROVED_ANNOUNCE,
  MSG_HELP,
  MSG_NOT_APPROVED,
  MSG_NOT_GROUP_CHAT,
  MSG_PENDING_REGISTERED,
} from './constants';

/**
 * Wires bot event handlers and slash commands.
 *
 * Registration flow:
 *   - bot added to group → my_chat_member event → creates PENDING TelegramGroup row
 *   - CEO/BD approves via admin panel (or interim CLI) → status APPROVED, companyId set
 *   - bot announces approval in the group → commands start working
 *
 * Authorization model:
 *   - All stats commands are gated by `resolveApprovedGroup(ctx)` — DMs and
 *     non-approved chats never see data.
 *   - /help works in any chat.
 *   - /unlink in a group is callable by any Telegram group admin (the chat
 *     itself is the ACL — no ERP role check needed for unlinking).
 */
@Injectable()
export class TelegramAdminBotRegistrar {
  private readonly logger = new Logger(TelegramAdminBotRegistrar.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupsService: TelegramGroupsService,
    private readonly statsService: TelegramGroupStatsService,
  ) {}

  register(bot: Telegraf): void {
    bot.start((ctx) => this.handleStart(ctx));
    bot.command('help', (ctx) => this.handleHelp(ctx));
    bot.command('status', (ctx) => this.handleStatus(ctx));
    bot.command('unlink', (ctx) => this.handleUnlink(ctx));

    // Stats commands — all gated by `resolveApprovedGroup`
    bot.command(['stats', 'statistika'], (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildOverallStats(cid)),
    );
    bot.command('oquvchilar', (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildStudentsBlock(cid)),
    );
    bot.command('oqituvchilar', (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildTeachersBlock(cid)),
    );
    bot.command('tolovlar', (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildPaymentsBlock(cid)),
    );
    bot.command('qarzdorlar', (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildDebtorsBlock(cid)),
    );
    bot.command('hisobot', (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildDailyReport(cid)),
    );
    bot.command('guruhlar', (ctx) =>
      this.handleStats(ctx, (cid) => this.statsService.buildGroupsBlock(cid)),
    );

    bot.on('my_chat_member', (ctx) => this.handleMyChatMember(ctx));
  }

  /**
   * Shared handler for all stats commands. Resolves the chat's approved
   * group (or bails) and then asks the stats service for the relevant block.
   *
   * Shows the native "typing..." indicator while the query runs. Telegram's
   * typing action lasts ~5 seconds; we re-emit every 4s for slower queries so
   * the user always sees feedback.
   */
  private async handleStats(
    ctx: Context,
    builder: (companyId: number) => Promise<string>,
  ): Promise<void> {
    const group = await this.resolveApprovedGroup(ctx);
    if (!group || !group.companyId) return;

    let typingInterval: NodeJS.Timeout | null = null;
    const emitTyping = () => {
      ctx.sendChatAction('typing').catch(() => {
        // best-effort; ignore failures
      });
    };
    emitTyping();
    typingInterval = setInterval(emitTyping, 4000);

    try {
      const message = await builder(group.companyId);
      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (err: any) {
      this.logger.error(
        `Stats command failed for chat ${ctx.chat?.id}: ${err?.message}`,
        err?.stack,
      );
      await ctx.reply('Statistika yuklashda xatolik. Qaytadan urinib ko\'ring.');
    } finally {
      if (typingInterval) clearInterval(typingInterval);
    }
  }

  /**
   * Fires whenever the bot's membership in a chat changes (added/removed/promoted).
   * Telegram delivers this regardless of Privacy Mode.
   */
  private async handleMyChatMember(ctx: Context): Promise<void> {
    const update = (ctx.update as any).my_chat_member;
    const chat = update?.chat;
    if (!chat) return;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;
    const fromId = ctx.from?.id ? BigInt(ctx.from.id) : null;
    const chatId = BigInt(chat.id);

    // Bot was added or promoted in the group.
    const wasOut = oldStatus === 'left' || oldStatus === 'kicked' || !oldStatus;
    const isInNow =
      newStatus === 'member' ||
      newStatus === 'administrator' ||
      newStatus === 'restricted';

    if (wasOut && isInNow) {
      await this.groupsService.onBotAddedToGroup({
        chatId,
        title: chat.title ?? `Chat ${chat.id}`,
        addedByTelegramUserId: fromId,
      });
      try {
        await ctx.telegram.sendMessage(
          chat.id,
          MSG_PENDING_REGISTERED(chat.id),
          { parse_mode: 'HTML' },
        );
      } catch (err: any) {
        this.logger.warn(
          `Could not greet new group ${chat.id}: ${err?.message ?? err}`,
        );
      }
      return;
    }

    // Bot was removed/kicked from the group.
    const isOutNow = newStatus === 'left' || newStatus === 'kicked';
    if (isOutNow) {
      await this.groupsService.onBotRemovedFromGroup(chatId);
    }
  }

  private async handleStart(ctx: Context): Promise<void> {
    if (ctx.chat?.type === 'private') {
      await ctx.reply(
        "Assalomu alaykum! Bu DaF admin boti — statistika va e'lonlar uchun.\n\n" +
          "Foydalanish uchun: botni o'zingizning Telegram guruhingizga qo'shing. " +
          "Bot guruhga qo'shilgach, admin paneldan tasdiqlang.",
      );
      return;
    }
    if (!ctx.chat) return;

    // In a group — show approval status. If the bot was added before this code
    // shipped (so my_chat_member never fired for it), auto-register on demand
    // so the admin panel can see the pending row.
    let group = await this.groupsService.findByChatId(BigInt(ctx.chat.id));
    if (!group) {
      group = await this.groupsService.onBotAddedToGroup({
        chatId: BigInt(ctx.chat.id),
        title: (ctx.chat as any).title ?? `Chat ${ctx.chat.id}`,
        addedByTelegramUserId: ctx.from?.id ? BigInt(ctx.from.id) : null,
      });
    }

    if (group.status === TelegramGroupStatus.PENDING) {
      await ctx.reply(MSG_PENDING_REGISTERED(ctx.chat.id), {
        parse_mode: 'HTML',
      });
      return;
    }
    await ctx.reply(`Guruh tasdiqlangan. Buyruqlar: /help`);
  }

  private async handleHelp(ctx: Context): Promise<void> {
    await ctx.reply(MSG_HELP, { parse_mode: 'HTML' });
  }

  private async handleStatus(ctx: Context): Promise<void> {
    if (!ctx.chat) return;
    if (ctx.chat.type === 'private') {
      await ctx.reply(MSG_NOT_GROUP_CHAT);
      return;
    }
    const group = await this.groupsService.findByChatId(BigInt(ctx.chat.id));
    if (!group) {
      await ctx.reply(MSG_PENDING_REGISTERED(ctx.chat.id), {
        parse_mode: 'HTML',
      });
      return;
    }
    if (group.status !== TelegramGroupStatus.APPROVED) {
      await ctx.reply(MSG_NOT_APPROVED);
      return;
    }
    const company = group.companyId
      ? await this.prisma.company.findUnique({
          where: { id: group.companyId },
          select: { name: true },
        })
      : null;
    await ctx.reply(
      `Ulangan kompaniya: ${company?.name ?? '—'}\nHolat: ${group.isActive ? 'faol' : "to'xtatilgan"}`,
    );
  }

  /**
   * Group admins (Telegram-side) can unlink the bot from their own group.
   * The chat itself is the ACL — no ERP role check needed.
   */
  private async handleUnlink(ctx: Context): Promise<void> {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
      await ctx.reply(MSG_NOT_GROUP_CHAT);
      return;
    }
    const group = await this.groupsService.findByChatId(BigInt(ctx.chat.id));
    if (!group) {
      await ctx.reply(MSG_PENDING_REGISTERED(ctx.chat.id), {
        parse_mode: 'HTML',
      });
      return;
    }

    const fromId = ctx.from?.id;
    if (!fromId) return;
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, fromId);
      if (member.status !== 'creator' && member.status !== 'administrator') {
        await ctx.reply('Faqat guruh administratori botni uzishi mumkin.');
        return;
      }
    } catch (err: any) {
      this.logger.warn(`getChatMember failed: ${err?.message}`);
      return;
    }
    await this.groupsService.unlinkFromGroup(group.id);
    await ctx.reply('✅ Bot guruhdan uzildi. Qayta ulash uchun botni guruhga qaytadan qo\'shing.');
  }

  /**
   * Helper used by Phase 2 stats commands — returns the APPROVED group for
   * this chat or null. Phase 2 commands should call this first and bail
   * with MSG_NOT_APPROVED if null.
   */
  async resolveApprovedGroup(ctx: Context) {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
      await ctx.reply(MSG_NOT_GROUP_CHAT);
      return null;
    }
    const group = await this.groupsService.findByChatId(BigInt(ctx.chat.id));
    if (!group || group.status !== TelegramGroupStatus.APPROVED || !group.isActive) {
      await ctx.reply(MSG_NOT_APPROVED);
      return null;
    }
    return group;
  }
}

/**
 * Sent by the controller (or CLI) after a CEO approves a pending group.
 * Posts a confirmation message in the group itself.
 */
export async function announceApproval(
  bot: Telegraf,
  chatId: bigint,
  companyName: string,
  approverName: string,
): Promise<void> {
  await bot.telegram.sendMessage(
    chatId.toString(),
    MSG_APPROVED_ANNOUNCE(companyName, approverName),
    { parse_mode: 'HTML' },
  );
}

import { Injectable, Logger } from '@nestjs/common';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import {
  TG_GROUP_THROTTLE_KEY_PREFIX,
  TG_GROUP_THROTTLE_SECONDS,
} from './constants';

export interface BroadcastOptions {
  companyId: number;
  branchId?: number | null;
  message: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  /**
   * Per-chat throttle bucket. Two events in the same bucket within
   * `throttleSeconds` are deduped — the second one is dropped silently.
   * Omit to skip throttling.
   */
  eventClass?: string;
  throttleSeconds?: number;
}

/**
 * Single entry point for sending messages to all approved Telegram groups
 * for a given company. Handles 403 (bot kicked) by auto-deactivating the row.
 */
@Injectable()
export class TelegramGroupBroadcastService {
  private readonly logger = new Logger(TelegramGroupBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly adminBot: TelegramAdminBotService,
  ) {}

  async broadcast(opts: BroadcastOptions): Promise<void> {
    const bot = this.adminBot.getBot();
    if (!bot) {
      this.logger.warn(
        'Broadcast skipped — admin bot not initialized (TELEGRAM_ADMIN_BOT_TOKEN missing?)',
      );
      return;
    }

    const groups = await this.prisma.telegramGroup.findMany({
      where: {
        companyId: opts.companyId,
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
        // If branchId is specified on the event, send to:
        //   - branch-scoped groups for that branch, AND
        //   - company-wide groups (branchId IS NULL)
        // Otherwise send to all approved groups for the company.
        ...(opts.branchId
          ? { OR: [{ branchId: opts.branchId }, { branchId: null }] }
          : {}),
      },
    });

    for (const g of groups) {
      // Throttle check (per-chat, per event class)
      if (opts.eventClass) {
        const throttleKey = `${TG_GROUP_THROTTLE_KEY_PREFIX}${g.chatId.toString()}:${opts.eventClass}`;
        const set = await this.redis.set(
          throttleKey,
          '1',
          'EX',
          opts.throttleSeconds ?? TG_GROUP_THROTTLE_SECONDS,
          'NX',
        );
        if (set === null) {
          // Key already exists → throttled. Drop silently.
          continue;
        }
      }

      try {
        await bot.telegram.sendMessage(g.chatId.toString(), opts.message, {
          parse_mode: opts.parseMode ?? 'HTML',
        });
      } catch (err: any) {
        const code = err?.response?.error_code ?? err?.code;
        if (code === 403) {
          this.logger.warn(
            `Bot kicked from chat ${g.chatId} — marking inactive`,
          );
          await this.prisma.telegramGroup
            .update({ where: { id: g.id }, data: { isActive: false } })
            .catch(() => undefined);
        } else {
          this.logger.error(
            `Failed to send broadcast to chat ${g.chatId}: ${err?.message ?? err}`,
          );
        }
      }
    }
  }
}

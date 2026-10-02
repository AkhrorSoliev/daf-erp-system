import type { LoggerService } from '@nestjs/common';
import type { Telegram } from 'telegraf';
import type { EntityHistoryService } from '../../common/entity-history';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  classifyTelegramError,
  describeError,
} from '../../telegram-digest/telegram-send';

/** Why a chat stopped taking the bot's messages, as the staff read it. */
export const BLOCKED_REASON = 'Botni bloklagan';

/** Methods whose success proves the chat takes the bot's messages. */
const DELIVERY_METHOD = /^(send|copy|forward)/;

/**
 * The chat id of a call aimed at a person's private chat, or null. Groups and
 * channels have negative ids or `@names`: they are never a student's chat.
 */
export function privateChatId(payload: unknown): string | null {
  const id = (payload as { chat_id?: unknown } | null | undefined)?.chat_id;
  if (typeof id !== 'number' && typeof id !== 'string') return null;
  const text = String(id);
  return /^[1-9]\d*$/.test(text) ? text : null;
}

/** Telegram's description of a permanent failure, in the staff's words. */
export function unreachableReason(description: string): string {
  if (/bot was blocked/i.test(description)) return BLOCKED_REASON;
  if (/user is deactivated/i.test(description)) {
    return "Telegram hisobini o'chirgan";
  }
  if (/can't initiate conversation/i.test(description)) {
    return 'Botni ishga tushirmagan';
  }
  if (/chat not found|PEER_ID_INVALID/i.test(description)) {
    return 'Telegram chat topilmadi';
  }
  return 'Telegram xabarni qabul qilmadi';
}

/** The fields of a `my_chat_member` update this class reads. */
export interface MyChatMemberUpdate {
  chat: { id: number; type: string };
  date: number;
  new_chat_member: { status: string };
}

/**
 * Whether the bot can still reach a student's linked Telegram chat —
 * `Student.telegramDisconnectedAt` (ADR-0066).
 *
 * The bot learns it in two ways, both handled here:
 * - Telegram says so: a private chat's `my_chat_member` update is `kicked`
 *   when the user blocks the bot and `member` when they unblock it.
 * - A send answers it: `watch` wraps the bot's API client, so every call
 *   reports its outcome. A permanent failure marks the chat, a delivered
 *   message clears it — an unblock the bot missed heals on the next message.
 *
 * The state belongs to the chat, not to one card: a parent's chat serves
 * several siblings, and blocking the bot cuts them all off at once. Sends are
 * never skipped for a marked chat: the mark is what the staff see and count,
 * and the next message still tries.
 */
export class StudentChatReach {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
    private readonly logger: LoggerService,
  ) {}

  /** Marks every live card on this chat that is not marked yet. */
  async disconnected(chatId: string, at: Date, reason: string): Promise<void> {
    const cards = await this.prisma.student.findMany({
      where: {
        telegramChatId: chatId,
        telegramDisconnectedAt: null,
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });
    for (const card of cards) {
      // Conditional per card: two failures racing on one chat mark it once.
      const { count } = await this.prisma.student.updateMany({
        where: { id: card.id, telegramDisconnectedAt: null },
        data: { telegramDisconnectedAt: at },
      });
      if (count === 0) continue;
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: card.id,
        companyId: card.companyId,
        newValues: { action: 'TELEGRAM_UZILDI', sabab: reason },
      });
    }
  }

  /** Clears the mark on every live card on this chat. */
  async reconnected(chatId: string): Promise<void> {
    const cards = await this.prisma.student.findMany({
      where: {
        telegramChatId: chatId,
        telegramDisconnectedAt: { not: null },
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });
    for (const card of cards) {
      const { count } = await this.prisma.student.updateMany({
        where: { id: card.id, telegramDisconnectedAt: { not: null } },
        data: { telegramDisconnectedAt: null },
      });
      if (count === 0) continue;
      await this.history.recordCreate({
        entityType: 'Student',
        entityId: card.id,
        companyId: card.companyId,
        newValues: { action: 'TELEGRAM_QAYTA_ULANDI' },
      });
    }
  }

  /** A private chat's `my_chat_member`: the user blocked or unblocked the bot. */
  async onMyChatMember(update: MyChatMemberUpdate): Promise<void> {
    if (update.chat.type !== 'private') return;
    const chatId = String(update.chat.id);
    const status = update.new_chat_member.status;
    if (status === 'kicked') {
      const at = new Date(update.date * 1000);
      await this.safely(() => this.disconnected(chatId, at, BLOCKED_REASON));
    } else if (status === 'member') {
      await this.safely(() => this.reconnected(chatId));
    }
  }

  /**
   * Reports the outcome of every call the bot makes through this client.
   *
   * Only the bot's own client (`bot.telegram`) is wrapped: a reply inside a
   * handler goes through a per-update client, and a person who just wrote to
   * the bot has not blocked it. The database write is not awaited, so a send
   * made inside a transaction never waits on a lock that transaction holds.
   */
  watch(telegram: Telegram): void {
    const call = telegram.callApi.bind(telegram) as (
      method: string,
      payload: unknown,
      options?: unknown,
    ) => Promise<unknown>;
    const watched = async (
      method: string,
      payload: unknown,
      options?: unknown,
    ): Promise<unknown> => {
      const chatId = privateChatId(payload);
      try {
        const result = await call(method, payload, options);
        if (chatId && DELIVERY_METHOD.test(method)) {
          void this.safely(() => this.reconnected(chatId));
        }
        return result;
      } catch (err) {
        const failure = chatId ? classifyTelegramError(err) : null;
        if (chatId && failure?.kind === 'permanent') {
          const reason = unreachableReason(failure.description);
          void this.safely(() => this.disconnected(chatId, new Date(), reason));
        }
        throw err;
      }
    };
    telegram.callApi = watched as unknown as typeof telegram.callApi;
  }

  /** Never lets bookkeeping fail a send or an update. */
  private async safely(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      this.logger.warn(
        `Could not record a student's Telegram chat state: ${describeError(err)}`,
      );
    }
  }
}

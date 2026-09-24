import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  TelegramDigestRecipientKind,
  TelegramGroupStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { DIGEST_ROW_MAX_AGE_MS } from '../telegram-digest/telegram-digest.constants';
import { TelegramDigestItemRow } from '../telegram-digest/telegram-digest-payloads';
import { packBlocks } from '../telegram-digest/telegram-message-parts';
import {
  describeError,
  sendTelegramText,
  TelegramTextSender,
} from '../telegram-digest/telegram-send';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { isTashkentSunday } from './utils/format.util';

type GroupRow = TelegramDigestItemRow & { deliveredGroupIds: string[] };

interface TargetGroup {
  id: string;
  chatId: bigint;
  branchId: number | null;
  receivesAllBranches: boolean;
}

/**
 * Which queued rows a Telegram group may see — the rule the old instant
 * broadcast applied: a `receivesAllBranches` group sees everything; any other
 * group sees company-wide rows and its own branch's. A legacy group with no
 * branch therefore sees company-wide rows only (fail-closed, see the
 * `TelegramGroup.receivesAllBranches` schema comment).
 */
export function isVisibleToGroup(
  row: { branchId: number | null },
  group: { branchId: number | null; receivesAllBranches: boolean },
): boolean {
  if (group.receivesAllBranches) return true;
  if (row.branchId == null) return true;
  return row.branchId === group.branchId;
}

/**
 * Sends each approved Telegram group one consolidated message a day, at
 * 20:00 Asia/Tashkent, from the GROUP rows of the digest queue (ADR-0025).
 * Sundays and holidays are skipped — rows wait for the next working day.
 * Delivery is tracked per group (`deliveredGroupIds`): a chat that failed
 * gets the rows again next run, a chat that got them never does twice.
 */
@Injectable()
export class TelegramGroupDigestCronService {
  private readonly logger = new Logger(TelegramGroupDigestCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminBot: TelegramAdminBotService,
    private readonly digest: TelegramGroupDigestService,
    private readonly holidaysService: HolidaysService,
  ) {}

  @Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })
  async flushDigests(): Promise<void> {
    await this.purgeStale();

    const bot = this.adminBot.getBot();
    if (!bot) {
      this.logger.warn('Skipped group digest — admin bot not initialized');
      return;
    }
    if (isTashkentSunday()) {
      this.logger.log('Skipped group digest — today is Sunday');
      return;
    }
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      new Date(),
    );
    if (holiday) {
      this.logger.log(
        `Skipped group digest — today is a holiday (${holiday.name})`,
      );
      return;
    }

    const rows = await this.prisma.telegramDigestItem.findMany({
      where: { recipientKind: TelegramDigestRecipientKind.GROUP },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (rows.length === 0) return;

    const byCompany = new Map<number, GroupRow[]>();
    for (const row of rows) {
      byCompany.set(row.companyId, [
        ...(byCompany.get(row.companyId) ?? []),
        row,
      ]);
    }
    const companies = await this.prisma.company.findMany({
      where: { id: { in: [...byCompany.keys()] } },
      select: { id: true, name: true },
    });
    const companyName = new Map(companies.map((c) => [c.id, c.name]));

    let sent = 0;
    for (const [companyId, companyRows] of byCompany) {
      try {
        sent += await this.flushCompany(
          bot,
          companyId,
          companyName.get(companyId) ?? 'Hisobot',
          companyRows,
        );
      } catch (err) {
        this.logger.error(
          `Group digest failed for company ${companyId}: ${describeError(err)}`,
        );
      }
    }
    this.logger.log(`Group digest flush — sent ${sent} message(s)`);
  }

  /** Spec: any row older than 7 days goes — also on Sundays, holidays, without a bot. */
  private async purgeStale(): Promise<void> {
    try {
      const { count } = await this.prisma.telegramDigestItem.deleteMany({
        where: {
          recipientKind: TelegramDigestRecipientKind.GROUP,
          createdAt: { lt: new Date(Date.now() - DIGEST_ROW_MAX_AGE_MS) },
        },
      });
      if (count > 1) {
        this.logger.warn(
          `Group digest: purged ${count} undelivered row(s) older than 7 days`,
        );
      }
    } catch (err) {
      this.logger.error(`Group digest purge failed: ${describeError(err)}`);
    }
  }

  /** Returns the number of Telegram messages sent for this company. */
  private async flushCompany(
    bot: TelegramTextSender,
    companyId: number,
    companyName: string,
    rows: GroupRow[],
  ): Promise<number> {
    const groups: TargetGroup[] = await this.prisma.telegramGroup.findMany({
      where: {
        companyId,
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        chatId: true,
        branchId: true,
        receivesAllBranches: true,
      },
    });

    const delivered = new Map(
      rows.map((r) => [r.id, new Set(r.deliveredGroupIds)]),
    );
    const unreachable = new Set<string>();
    const now = new Date();
    let sent = 0;

    for (const group of groups) {
      const pending = rows.filter(
        (r) =>
          isVisibleToGroup(r, group) && !delivered.get(r.id)?.has(group.id),
      );
      const blocks = this.digest.buildBlocks(companyName, pending, now);
      if (!blocks) continue;

      for (const part of packBlocks(blocks)) {
        const outcome = await sendTelegramText(
          bot,
          group.chatId.toString(),
          part.text,
          {
            parse_mode: 'HTML',
          },
        );
        if (!outcome.ok) {
          if (outcome.kind === 'permanent') {
            // The chat is gone for good. 403 (bot removed) deactivates the
            // group as before; any other permanent error (chat not found,
            // group migrated) just stops this run from waiting for it.
            if (outcome.code === 403) await this.deactivate(group);
            else {
              this.logger.warn(
                `Group digest: chat ${group.chatId} unreachable (${outcome.description}) — not waiting for it this run`,
              );
            }
            unreachable.add(group.id);
          } else {
            const message = `Group digest to chat ${group.chatId} failed (${outcome.kind}: ${outcome.description}) — kept for the next run`;
            if (outcome.kind === 'content') this.logger.error(message);
            else this.logger.warn(message);
          }
          break;
        }
        sent += 1;
        for (const id of part.itemIds) delivered.get(id)?.add(group.id);
        await this.markDelivered(part.itemIds, group.id);
      }
    }

    // A row is done once every reachable group that may see it has it. A row
    // no such group can see (e.g. no approved group at all) is done now.
    const liveGroups = groups.filter((g) => !unreachable.has(g.id));
    const done = rows
      .filter((r) =>
        liveGroups.every(
          (g) => !isVisibleToGroup(r, g) || delivered.get(r.id)?.has(g.id),
        ),
      )
      .map((r) => r.id);
    if (done.length > 0) {
      await this.prisma.telegramDigestItem.deleteMany({
        where: { id: { in: done } },
      });
    }
    return sent;
  }

  /**
   * Persists delivery so a crash between here and the final delete never
   * resends to this chat. One retry; a write that still fails is logged, not
   * thrown — the row is still deleted below if every group has it.
   */
  private async markDelivered(ids: string[], groupId: string): Promise<void> {
    if (ids.length === 0) return;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.prisma.telegramDigestItem.updateMany({
          where: { id: { in: ids } },
          data: { deliveredGroupIds: { push: groupId } },
        });
        return;
      } catch (err) {
        if (attempt === 2) {
          this.logger.warn(
            `Could not record digest delivery to group ${groupId}: ${describeError(err)}`,
          );
        }
      }
    }
  }

  /** 403: the bot was removed from the chat — same handling as before. */
  private async deactivate(group: TargetGroup): Promise<void> {
    this.logger.warn(`Bot kicked from chat ${group.chatId} — marking inactive`);
    await this.prisma.telegramGroup
      .update({ where: { id: group.id }, data: { isActive: false } })
      .catch(() => undefined);
  }
}

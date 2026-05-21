import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import {
  DigestEntry,
  TelegramGroupDigestBufferService,
} from './telegram-group-digest-buffer.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';

/**
 * Flushes each company's buffered group events into a single consolidated
 * digest message every 3 hours (09:00, 12:00, 15:00, 18:00, 21:00 Tashkent).
 *
 * This replaces the old per-event broadcasts for low-priority events
 * (new student, new payment, new group) — instead of dozens of tiny messages
 * the group gets one tidy summary. Status changes and very large payments
 * still go out instantly via `TelegramGroupBroadcastListener`.
 *
 * Buffers for companies without any approved group are never drained here;
 * they self-expire via `TG_GROUP_DIGEST_BUFFER_TTL_SECONDS`.
 */
@Injectable()
export class TelegramGroupDigestCronService {
  private readonly logger = new Logger(TelegramGroupDigestCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminBot: TelegramAdminBotService,
    private readonly buffer: TelegramGroupDigestBufferService,
    private readonly digest: TelegramGroupDigestService,
  ) {}

  @Cron('0 9,12,15,18,21 * * *', { timeZone: 'Asia/Tashkent' })
  async flushDigests(): Promise<void> {
    const bot = this.adminBot.getBot();
    if (!bot) {
      this.logger.warn('Skipped digest flush — admin bot not initialized');
      return;
    }

    const groups = await this.prisma.telegramGroup.findMany({
      where: {
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
        companyId: { not: null },
      },
      select: { id: true, chatId: true, companyId: true, branchId: true },
    });
    if (groups.length === 0) return;

    // Bucket the groups by company so each company's buffer is drained once.
    const byCompany = new Map<number, typeof groups>();
    for (const g of groups) {
      if (g.companyId == null) continue;
      const list = byCompany.get(g.companyId) ?? [];
      list.push(g);
      byCompany.set(g.companyId, list);
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: [...byCompany.keys()] } },
      select: { id: true, name: true },
    });
    const companyName = new Map(companies.map((c) => [c.id, c.name]));

    const now = new Date();
    let sent = 0;
    for (const [companyId, companyGroups] of byCompany) {
      const entries = await this.buffer.drain(companyId);
      if (entries.length === 0) continue;

      for (const g of companyGroups) {
        const visible = this.filterForGroup(entries, g.branchId);
        const message = this.digest.build(
          companyName.get(companyId) ?? 'Hisobot',
          visible,
          now,
        );
        if (!message) continue; // nothing visible for this group's branch

        try {
          await bot.telegram.sendMessage(g.chatId.toString(), message, {
            parse_mode: 'HTML',
          });
          sent += 1;
        } catch (err: any) {
          await this.handleSendError(err, g.id, g.chatId);
        }
      }
    }

    this.logger.log(`Digest flush — sent ${sent} message(s)`);
  }

  /**
   * A company-wide group (`branchId = null`) sees every event. A branch-scoped
   * group sees only its own branch's events plus company-wide ones (events
   * with no branch) — mirrors the old `TelegramGroupBroadcastService` rule.
   */
  private filterForGroup(
    entries: DigestEntry[],
    groupBranchId: number | null,
  ): DigestEntry[] {
    if (groupBranchId == null) return entries;
    return entries.filter(
      (e) => e.branchId == null || e.branchId === groupBranchId,
    );
  }

  private async handleSendError(
    err: any,
    groupId: string,
    chatId: bigint,
  ): Promise<void> {
    const code = err?.response?.error_code ?? err?.code;
    if (code === 403) {
      this.logger.warn(`Bot kicked from chat ${chatId} — marking inactive`);
      await this.prisma.telegramGroup
        .update({ where: { id: groupId }, data: { isActive: false } })
        .catch(() => undefined);
    } else {
      this.logger.error(
        `Digest send failed for chat ${chatId}: ${err?.message ?? err}`,
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { isVisibleToGroup } from './telegram-group-digest-cron.service';
import { notHeldGroupText } from './utils/unmarked-lesson-text';
import { sendTelegramText } from '../telegram-digest/telegram-send';
import {
  UNMARKED_LESSON_NOT_HELD,
  type UnmarkedLessonNotHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';

/**
 * «Bo'lmadi» reaches the Telegram group at once — a CEO decision (spec
 * 2026-09-29 Q3) that puts it on ADR-0025's instant list (recorded in
 * ADR-0054). Same branch visibility as the 20:00 group digest.
 */
@Injectable()
export class TelegramGroupUnmarkedLessonListener {
  private readonly logger = new Logger(
    TelegramGroupUnmarkedLessonListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminBot: TelegramAdminBotService,
  ) {}

  @OnEvent(UNMARKED_LESSON_NOT_HELD)
  async handle(p: UnmarkedLessonNotHeldPayload) {
    const bot = this.adminBot.getBot();
    if (!bot) return;
    try {
      const [groups, actor] = await Promise.all([
        this.prisma.telegramGroup.findMany({
          where: {
            companyId: p.companyId,
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
        }),
        this.prisma.user.findUnique({
          where: { id: p.decidedById },
          select: { firstName: true, lastName: true },
        }),
      ]);
      const text = notHeldGroupText(
        p,
        actor ? `${actor.firstName} ${actor.lastName}` : '—',
      );
      for (const group of groups) {
        if (!isVisibleToGroup({ branchId: p.branchId }, group)) continue;
        const outcome = await sendTelegramText(
          bot,
          group.chatId.toString(),
          text,
          { parse_mode: 'HTML' },
        );
        if (!outcome.ok) {
          this.logger.warn(
            `«Dars bo'lmadi» notice to chat ${group.chatId} failed (${outcome.kind}: ${outcome.description})`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `«Dars bo'lmadi» notice failed for ${p.groupId} ${p.date}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

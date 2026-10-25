import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PURGE_BATCH, PURGE_INACTIVE_DAYS } from '../chat.constants';
import { ChatFileStorage } from './chat-file-storage';

const MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly: a file goes when its message was deleted by the sender, or when
 * NEITHER student of its conversation has opened the app for 30 days. The
 * message row and any report snapshot (text) stay; the client shows
 * «Fayl o'chirilgan». A removal that fails leaves the row for tomorrow.
 */
@Injectable()
export class ChatMediaPurgeService {
  private readonly logger = new Logger(ChatMediaPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ChatFileStorage,
  ) {}

  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async run(now: Date = new Date()): Promise<void> {
    if (!this.storage.enabled) return;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const { purged } = await this.purgeBatch(now);
        if (purged === 0) break;
      }
    } catch (err) {
      this.logger.warn(
        `Chat media purge failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  async purgeBatch(
    now: Date = new Date(),
  ): Promise<{ purged: number; failed: number }> {
    const cutoff = new Date(now.getTime() - PURGE_INACTIVE_DAYS * DAY_MS);
    const rows = await this.prisma.$queryRaw<{ id: string; fileKey: string }[]>`
      SELECT m."id", m."fileKey"
      FROM "ChatMessage" m
      JOIN "ChatConversation" c ON c."id" = m."conversationId"
      WHERE m."fileKey" IS NOT NULL
        AND m."mediaPurgedAt" IS NULL
        AND (
          m."deletedAt" IS NOT NULL
          OR NOT EXISTS (
            SELECT 1 FROM "StudentAppSession" s
            WHERE s."studentId" IN (c."studentLowId", c."studentHighId")
              AND s."lastSeenAt" >= ${cutoff}
          )
        )
      ORDER BY m."createdAt"
      LIMIT ${PURGE_BATCH}`;
    let purged = 0;
    let failed = 0;
    for (const row of rows) {
      if (await this.storage.remove(row.fileKey)) {
        await this.prisma.chatMessage.update({
          where: { id: row.id },
          data: { mediaPurgedAt: now },
        });
        purged += 1;
      } else {
        failed += 1;
      }
    }
    return { purged, failed };
  }
}

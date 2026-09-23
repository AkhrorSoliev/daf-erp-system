import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnqueueDigestItem } from './telegram-digest-payloads';

/**
 * The single write path into the Telegram digest queue (ADR-0025). Every
 * event that waits for the 20:00 digest calls `enqueue()` instead of sending.
 * Throws on a database error — listeners catch and log, so the business
 * write that fired the event is never affected.
 */
@Injectable()
export class TelegramDigestQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(item: EnqueueDigestItem): Promise<void> {
    await this.prisma.telegramDigestItem.create({
      data: {
        recipientKind: item.recipientKind,
        recipientId: item.recipientId,
        companyId: item.companyId,
        branchId: item.branchId ?? null,
        category: item.category,
        relatedEntityId: item.relatedEntityId ?? null,
        payload: item.payload as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

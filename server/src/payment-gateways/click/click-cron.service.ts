import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Periodically cancels expired Click transactions (status=1 older than 30 min).
 * Click transactions have a shorter lifecycle than Payme.
 */
@Injectable()
export class ClickCronService {
  private readonly logger = new Logger(ClickCronService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 */10 * * * *') // every 10 minutes
  async cleanupExpiredTransactions() {
    const cutoff = new Date(Date.now() - THIRTY_MINUTES_MS);

    const { count } = await this.prisma.clickTransaction.updateMany({
      where: { status: 1, prepareTime: { lt: cutoff } },
      data: { status: -1, error: -9, errorNote: 'Transaction expired' },
    });

    if (count > 0) {
      this.logger.log(`Cancelled ${count} expired Click transaction(s)`);
    }
  }
}

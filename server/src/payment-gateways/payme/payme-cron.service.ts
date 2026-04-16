import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Periodically cancels expired Payme transactions (state=1 older than 12h).
 * Payme auto-cancels on their side too, but this keeps our DB clean.
 */
@Injectable()
export class PaymeCronService {
  private readonly logger = new Logger(PaymeCronService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 */30 * * * *') // every 30 minutes
  async cleanupExpiredTransactions() {
    const cutoff = BigInt(Date.now() - TWELVE_HOURS_MS);

    const { count } = await this.prisma.paymeTransaction.updateMany({
      where: { state: 1, createTime: { lt: cutoff } },
      data: { state: -1, cancelTime: BigInt(Date.now()), reason: 4 },
    });

    if (count > 0) {
      this.logger.log(`Cancelled ${count} expired Payme transaction(s)`);
    }
  }
}

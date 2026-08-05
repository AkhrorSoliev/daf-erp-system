import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DailySnapshotService } from './daily-snapshot.service';

/**
 * 23:40 Tashkent, EVERY day — Sundays and holidays included.
 *
 * The Telegram daily cron deliberately skips days off, and the snapshot used to
 * ride on it, so those days had no row at all. A month closing on a Sunday
 * therefore had no closing figure. The snapshot is the month's record; it must
 * not inherit a day-off rule written for a chat message.
 *
 * 23:40 rather than 21:00 so the day is as complete as it can be — a payment
 * entered at 22:00 still lands in its own day.
 */
@Injectable()
export class DailySnapshotCron {
  private readonly logger = new Logger(DailySnapshotCron.name);

  constructor(
    private prisma: PrismaService,
    private snapshots: DailySnapshotService,
  ) {}

  @Cron('0 40 23 * * *', { timeZone: 'Asia/Tashkent' })
  async run() {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    for (const c of companies) {
      try {
        await this.snapshots.persistForCompany(c.id);
      } catch (e) {
        this.logger.error(`Snapshot cron failed for company ${c.id}: ${e}`);
      }
    }
    this.logger.log(
      `Daily snapshot written for ${companies.length} company(ies)`,
    );
  }
}

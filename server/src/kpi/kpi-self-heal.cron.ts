import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KpiResultsService } from './kpi-results.service';

/** Every night at 03:30 Tashkent the last two days are walked again (spec §7.6). */
@Injectable()
export class KpiSelfHealCron {
  private readonly logger = new Logger(KpiSelfHealCron.name);
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(private results: KpiResultsService) {}

  @Cron('0 30 3 * * *', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.results.selfHeal(new Date());
      if (r.cancelled || r.written) {
        this.logger.log(
          `KPI repair: ${r.written} written, ${r.cancelled} cancelled`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}

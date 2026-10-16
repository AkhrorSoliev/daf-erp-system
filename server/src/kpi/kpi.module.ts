import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { KpiController } from './kpi.controller';
import { KpiReadService } from './kpi-read.service';
import { KpiRecorderListener } from './kpi-recorder.listener';
import { KpiResultsService } from './kpi-results.service';
import { KpiSelfHealCron } from './kpi-self-heal.cron';
import { KpiSettingsService } from './kpi-settings.service';

/** Admin KPI results (ADR-0095). Stage 2: recorded and shown, no money. */
@Module({
  imports: [SettingsModule],
  controllers: [KpiController],
  providers: [
    KpiSettingsService,
    KpiResultsService,
    KpiReadService,
    KpiRecorderListener,
    KpiSelfHealCron,
  ],
})
export class KpiModule {}

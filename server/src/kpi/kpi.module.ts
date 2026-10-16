import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { KpiRecorderListener } from './kpi-recorder.listener';
import { KpiResultsService } from './kpi-results.service';
import { KpiSettingsService } from './kpi-settings.service';

/** Admin KPI results (ADR-0094). Stage 2: recorded and shown, no money. */
@Module({
  imports: [SettingsModule],
  providers: [KpiSettingsService, KpiResultsService, KpiRecorderListener],
})
export class KpiModule {}

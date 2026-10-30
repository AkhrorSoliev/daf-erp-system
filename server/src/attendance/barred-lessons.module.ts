import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { SettingsModule } from '../settings/settings.module';
import { BarredLessonsService } from './barred-lessons.service';

/**
 * `BarredLessonsService` o'z modulida (ADR-0142): uni outreach, avto-pauza va
 * o'quvchilar moduli o'qiydi, `AttendanceModule` esa ulardan ba'zilariga
 * tayanadi. Alohida modul sikl yaratmasdan hammasiga ulanish imkonini beradi.
 */
@Module({
  imports: [BillingModule, SettingsModule],
  providers: [BarredLessonsService],
  exports: [BarredLessonsService],
})
export class BarredLessonsModule {}

import { Module } from '@nestjs/common';
import { AbsencePauseSettingService } from './absence-pause-setting.service';

/**
 * Sozlama servisi ataylab o'z modulida.
 *
 * Undan IKKALA tomon o'qiydi: `AbsencePauseModule` (cron) va
 * `OutreachModule` (ro'yxat chegarasi). Agar u `AbsencePauseModule` ichida
 * qolsa, `AbsencePauseModule` esa cron uchun `OutreachModule` dan
 * `AbsenceStreakService` ni olsa — aylanma bog'liqlik hosil bo'lardi.
 *
 * `forwardRef` bilan halqani «yechish» ham mumkin edi, lekin u halqani
 * yashiradi; kichik modul uni butunlay yo'q qiladi. Bu modulning o'z
 * bog'liqligi yo'q — `PrismaModule` va `EntityHistoryModule` global.
 */
@Module({
  providers: [AbsencePauseSettingService],
  exports: [AbsencePauseSettingService],
})
export class AbsencePauseSettingModule {}

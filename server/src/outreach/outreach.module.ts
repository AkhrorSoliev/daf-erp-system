import { Module } from '@nestjs/common';
import { OutreachController } from './outreach.controller';
import { OutreachService } from './outreach.service';
import { AbsenceStreakService } from './absence-streak.service';
import { AbsencePauseSettingModule } from '../absence-pause/absence-pause-setting.module';

@Module({
  // Chegara sozlamasi — o'z kichik modulidan. `AbsencePauseModule` ning
  // o'zini import qilish aylanma bog'liqlik hosil qilardi (u cron uchun
  // shu moduldan `AbsenceStreakService` ni oladi).
  imports: [AbsencePauseSettingModule],
  controllers: [OutreachController],
  providers: [OutreachService, AbsenceStreakService],
  // Bosh sahifaning boshqaruv paneli (`DashboardSummaryService`) «e'tibor»
  // sonlarini shu servisdan oladi — o'zi qaytadan hisoblamasligi uchun.
  // `AbsenceStreakService` — avtomatik pauza cron'i shundan o'qiydi, ya'ni
  // ro'yxat va harakat bitta ta'rifdan oziqlanadi.
  exports: [OutreachService, AbsenceStreakService],
})
export class OutreachModule {}

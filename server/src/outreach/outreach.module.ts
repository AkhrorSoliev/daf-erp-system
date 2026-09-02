import { Module } from '@nestjs/common';
import { OutreachController } from './outreach.controller';
import { OutreachService } from './outreach.service';
import { AbsenceStreakService } from './absence-streak.service';

@Module({
  controllers: [OutreachController],
  providers: [OutreachService, AbsenceStreakService],
  // Bosh sahifaning boshqaruv paneli (`DashboardSummaryService`) «e'tibor»
  // sonlarini shu servisdan oladi — o'zi qaytadan hisoblamasligi uchun.
  exports: [OutreachService],
})
export class OutreachModule {}

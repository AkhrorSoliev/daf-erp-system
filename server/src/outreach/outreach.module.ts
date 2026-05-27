import { Module } from '@nestjs/common';
import { OutreachController } from './outreach.controller';
import { OutreachService } from './outreach.service';
import { AbsenceStreakService } from './absence-streak.service';

@Module({
  controllers: [OutreachController],
  providers: [OutreachService, AbsenceStreakService],
})
export class OutreachModule {}

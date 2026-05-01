import { Module } from '@nestjs/common';
import { LessonReschedulesController } from './lesson-reschedules.controller';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [LessonReschedulesController],
  providers: [LessonReschedulesService],
  exports: [LessonReschedulesService],
})
export class LessonReschedulesModule {}

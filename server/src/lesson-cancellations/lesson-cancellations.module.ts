import { Module } from '@nestjs/common';
import { LessonCancellationsController } from './lesson-cancellations.controller';
import { LessonCancellationsService } from './lesson-cancellations.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [LessonCancellationsController],
  providers: [LessonCancellationsService],
  exports: [LessonCancellationsService],
})
export class LessonCancellationsModule {}

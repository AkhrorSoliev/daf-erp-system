import { Module } from '@nestjs/common';
import { LessonTeacherOverridesController } from './lesson-teacher-overrides.controller';
import { LessonTeacherOverridesService } from './lesson-teacher-overrides.service';
import { SalaryModule } from '../salary/salary.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [SalaryModule, BillingModule],
  controllers: [LessonTeacherOverridesController],
  providers: [LessonTeacherOverridesService],
  exports: [LessonTeacherOverridesService],
})
export class LessonTeacherOverridesModule {}

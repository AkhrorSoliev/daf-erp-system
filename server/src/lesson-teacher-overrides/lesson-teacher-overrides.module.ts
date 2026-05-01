import { Module } from '@nestjs/common';
import { LessonTeacherOverridesController } from './lesson-teacher-overrides.controller';
import { LessonTeacherOverridesService } from './lesson-teacher-overrides.service';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [SalaryModule],
  controllers: [LessonTeacherOverridesController],
  providers: [LessonTeacherOverridesService],
  exports: [LessonTeacherOverridesService],
})
export class LessonTeacherOverridesModule {}

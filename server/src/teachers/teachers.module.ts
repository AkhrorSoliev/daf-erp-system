import { Module } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { TeachersController } from './teachers.controller';
import { TeacherStatsService } from './teacher-stats.service';
import { UploadModule } from '../upload/upload.module';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [UploadModule, SalaryModule],
  controllers: [TeachersController],
  providers: [TeachersService, TeacherStatsService],
  exports: [TeachersService],
})
export class TeachersModule {}

import { Module } from '@nestjs/common';
import { DafModule } from '../daf/daf.module';
import { StudentActivityController } from './student-activity.controller';
import { GroupAppActivityController } from './group-app-activity.controller';
import { StudentAppActivityController } from './student-app-activity.controller';
import { AppActivityWriteService } from './app-activity-write.service';
import { AppActivityStatsService } from './app-activity-stats.service';

@Module({
  imports: [DafModule],
  controllers: [
    StudentActivityController,
    GroupAppActivityController,
    StudentAppActivityController,
  ],
  providers: [AppActivityWriteService, AppActivityStatsService],
  exports: [AppActivityWriteService],
})
export class AppActivityModule {}

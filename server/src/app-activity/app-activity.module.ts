import { Module } from '@nestjs/common';
import { DafModule } from '../daf/daf.module';
import { StudentActivityController } from './student-activity.controller';
import { GroupAppActivityController } from './group-app-activity.controller';
import { StudentAppActivityController } from './student-app-activity.controller';
import { AppActivityWriteService } from './app-activity-write.service';
import { AppActivityStatsQueries } from './app-activity-stats.queries';
import { AppActivityStatsService } from './app-activity-stats.service';
import { CenterAppActivityController } from './center/center-app-activity.controller';
import { CenterAppActivityQueries } from './center/center-app-activity.queries';
import { CenterAppActivityService } from './center/center-app-activity.service';

@Module({
  imports: [DafModule],
  controllers: [
    StudentActivityController,
    GroupAppActivityController,
    StudentAppActivityController,
    CenterAppActivityController,
  ],
  providers: [
    AppActivityWriteService,
    AppActivityStatsService,
    AppActivityStatsQueries,
    CenterAppActivityQueries,
    CenterAppActivityService,
  ],
  exports: [AppActivityWriteService],
})
export class AppActivityModule {}

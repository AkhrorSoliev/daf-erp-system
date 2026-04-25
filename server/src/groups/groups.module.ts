import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsReadService } from './groups-read.service';
import { GroupsWriteService } from './groups-write.service';
import { GroupsStatusService } from './groups-status.service';
import { GroupScheduleService } from './group-schedule.service';
import { GroupStatusCronService } from './group-status-cron.service';
import { GroupsController } from './groups.controller';

@Module({
  controllers: [GroupsController],
  providers: [
    GroupsService,
    GroupsReadService,
    GroupsWriteService,
    GroupsStatusService,
    GroupScheduleService,
    GroupStatusCronService,
  ],
  exports: [GroupsService, GroupScheduleService],
})
export class GroupsModule {}

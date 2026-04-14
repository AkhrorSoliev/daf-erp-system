import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupScheduleService } from './group-schedule.service';
import { GroupStatusCronService } from './group-status-cron.service';
import { GroupsController } from './groups.controller';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupScheduleService, GroupStatusCronService],
  exports: [GroupsService, GroupScheduleService],
})
export class GroupsModule {}

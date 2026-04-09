import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupScheduleService } from './group-schedule.service';
import { GroupsController } from './groups.controller';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupScheduleService],
  exports: [GroupsService, GroupScheduleService],
})
export class GroupsModule {}

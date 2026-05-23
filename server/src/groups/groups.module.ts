import { Module, forwardRef } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsReadService } from './groups-read.service';
import { GroupsWriteService } from './groups-write.service';
import { GroupsStatusService } from './groups-status.service';
import { GroupScheduleService } from './group-schedule.service';
import { GroupStatusCronService } from './group-status-cron.service';
import { GroupHolidayCascadeService } from './group-holiday-cascade.service';
import { GroupsController } from './groups.controller';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [forwardRef(() => HolidaysModule)],
  controllers: [GroupsController],
  providers: [
    GroupsService,
    GroupsReadService,
    GroupsWriteService,
    GroupsStatusService,
    GroupScheduleService,
    GroupStatusCronService,
    GroupHolidayCascadeService,
  ],
  exports: [
    GroupsService,
    GroupScheduleService,
    GroupHolidayCascadeService,
  ],
})
export class GroupsModule {}

import { Module } from '@nestjs/common';
import { GroupTeacherChangeReasonsService } from './group-teacher-change-reasons.service';
import { GroupTeacherChangeReasonsController } from './group-teacher-change-reasons.controller';

@Module({
  controllers: [GroupTeacherChangeReasonsController],
  providers: [GroupTeacherChangeReasonsService],
  exports: [GroupTeacherChangeReasonsService],
})
export class GroupTeacherChangeReasonsModule {}

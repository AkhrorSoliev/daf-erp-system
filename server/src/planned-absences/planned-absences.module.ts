import { Module } from '@nestjs/common';
import { PlannedAbsencesService } from './planned-absences.service';
import { PlannedAbsencesController } from './planned-absences.controller';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  // AttendanceModule exports AttendanceValidationService (reused for lesson-date
  // validation). PrismaModule and EntityHistoryModule are global.
  imports: [AttendanceModule],
  controllers: [PlannedAbsencesController],
  providers: [PlannedAbsencesService],
})
export class PlannedAbsencesModule {}

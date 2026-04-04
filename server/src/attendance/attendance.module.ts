import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { QrAttendanceService } from './qr-attendance.service';
import { AttendanceController } from './attendance.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, QrAttendanceService],
  exports: [AttendanceService, QrAttendanceService],
})
export class AttendanceModule {}

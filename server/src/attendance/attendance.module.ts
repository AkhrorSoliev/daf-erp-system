import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { QrAttendanceService } from './qr-attendance.service';
import { AttendanceController } from './attendance.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [NotificationsModule, TransactionsModule, SalaryModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, QrAttendanceService],
  exports: [AttendanceService, QrAttendanceService],
})
export class AttendanceModule {}

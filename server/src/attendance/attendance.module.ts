import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { QrAttendanceService } from './qr-attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceReminderService } from './attendance-reminder.service';
import { AttendanceEventsListener } from './attendance-events.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [
    NotificationsModule,
    TelegramModule,
    TransactionsModule,
    SalaryModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    QrAttendanceService,
    AttendanceReminderService,
    AttendanceEventsListener,
  ],
  exports: [AttendanceService, QrAttendanceService],
})
export class AttendanceModule {}

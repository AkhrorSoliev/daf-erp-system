import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceValidationService } from './attendance-validation.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceStatsService } from './attendance-stats.service';
import { AttendanceSaveService } from './attendance-save.service';
import { QrAttendanceService } from './qr-attendance.service';
import { QrAttendanceSessionService } from './qr-attendance-session.service';
import { QrAttendanceScanService } from './qr-attendance-scan.service';
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
    AttendanceValidationService,
    AttendanceReadService,
    AttendanceStatsService,
    AttendanceSaveService,
    QrAttendanceService,
    QrAttendanceSessionService,
    QrAttendanceScanService,
    AttendanceReminderService,
    AttendanceEventsListener,
  ],
  exports: [AttendanceService, QrAttendanceService],
})
export class AttendanceModule {}

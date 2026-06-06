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
import { StudentAttendanceNotificationListener } from './student-attendance-notification.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { BillingModule } from '../billing/billing.module';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [NotificationsModule, TelegramModule, BillingModule, HolidaysModule],
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
    StudentAttendanceNotificationListener,
  ],
  exports: [
    AttendanceService,
    QrAttendanceService,
    // Exported so PlannedAbsencesModule can reuse the exact same lesson-date
    // validation (format / ACTIVE / range / schedule / cancellation / holiday)
    // without duplicating the rules.
    AttendanceValidationService,
  ],
})
export class AttendanceModule {}

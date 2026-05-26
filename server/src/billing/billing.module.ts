import { Module } from '@nestjs/common';
import { LessonBillingService } from './lesson-billing.service';
import { EnrollmentBillingService } from './enrollment-billing.service';
import { DebtWriteOffService } from './debt-write-off.service';
import { BillingController } from './billing.controller';
import { StudentDebtNotificationListener } from './student-debt-notification.listener';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';
import { TelegramModule } from '../telegram/telegram.module';

/**
 * Owns the unified billing pipeline that both manual and QR attendance
 * delegate to, plus the enrollment-lifecycle prepaid refund helper used
 * when an enrollment is DROPPED or transferred. The debt-notification
 * listener lives here too — it reacts to attendance events from the
 * attendance module and pings the student over Telegram when the
 * billing layer just pushed their balance into the red.
 *
 * `DebtWriteOffService` is the "yo'qolgan o'quvchi" write-off flow —
 * admin-driven clearing of the current-cycle portion of a student's debt
 * when the student never attended any lesson in this cycle.
 */
@Module({
  imports: [TransactionsModule, SalaryModule, TelegramModule],
  controllers: [BillingController],
  providers: [
    LessonBillingService,
    EnrollmentBillingService,
    DebtWriteOffService,
    StudentDebtNotificationListener,
  ],
  exports: [
    LessonBillingService,
    EnrollmentBillingService,
    DebtWriteOffService,
  ],
})
export class BillingModule {}

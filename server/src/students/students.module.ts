import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsReadService } from './students-read.service';
import { StudentsWriteService } from './students-write.service';
import { StudentsStatusService } from './students-status.service';
import { StudentEnrollmentService } from './student-enrollment.service';
import { StudentsController } from './students.controller';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';
import { StudentPortalReadService } from './student-portal-read.service';
import { StudentPortalWriteService } from './student-portal-write.service';
import { UploadModule } from '../upload/upload.module';
import { SmsModule } from '../sms/sms.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PaymentGatewaysModule } from '../payment-gateways/payment-gateways.module';
import { BillingModule } from '../billing/billing.module';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';
import { EskizModule } from '../eskiz/eskiz.module';
import { StudentOnboardingController } from './onboarding/student-onboarding.controller';
import { StudentOnboardingService } from './onboarding/student-onboarding.service';
import { StudentExtraPhoneController } from './extra-phone/student-extra-phone.controller';
import { StudentExtraPhoneService } from './extra-phone/student-extra-phone.service';
import { StudentDeparturePreviewService } from './student-departure-preview.service';
import { StudentEnrollPreviewService } from './student-enroll-preview.service';

@Module({
  imports: [
    UploadModule,
    SmsModule,
    AttendanceModule,
    TransactionsModule,
    PaymentGatewaysModule,
    BillingModule,
    SettingsModule,
    AuthModule,
    EskizModule,
  ],
  controllers: [
    StudentsController,
    StudentPortalController,
    StudentOnboardingController,
    StudentExtraPhoneController,
  ],
  providers: [
    StudentsService,
    StudentsReadService,
    StudentsWriteService,
    StudentsStatusService,
    StudentEnrollmentService,
    StudentPortalService,
    StudentPortalReadService,
    StudentPortalWriteService,
    StudentOnboardingService,
    StudentExtraPhoneService,
    StudentDeparturePreviewService,
    StudentEnrollPreviewService,
  ],
  // `StudentsStatusService` — avtomatik pauza cron'i uchun
  // (`pauseForAbsence`, tizim aktori bilan).
  exports: [StudentsService, StudentEnrollmentService, StudentsStatusService],
})
export class StudentsModule {}

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
import { StudentAiChatController } from './student-ai-chat.controller';
import { StudentAiChatService } from './student-ai-chat.service';
import { UploadModule } from '../upload/upload.module';
import { SmsModule } from '../sms/sms.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PaymentGatewaysModule } from '../payment-gateways/payment-gateways.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    UploadModule,
    SmsModule,
    AttendanceModule,
    TransactionsModule,
    PaymentGatewaysModule,
    BillingModule,
  ],
  controllers: [
    StudentsController,
    StudentPortalController,
    StudentAiChatController,
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
    StudentAiChatService,
  ],
  exports: [StudentsService, StudentEnrollmentService],
})
export class StudentsModule {}

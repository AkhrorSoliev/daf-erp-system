import { Module } from '@nestjs/common';
import { MockExamSectionsController } from './mock-exam-sections.controller';
import { MockExamSectionsService } from './mock-exam-sections.service';
import { MockExamsController } from './mock-exams.controller';
import { MockExamsService } from './mock-exams.service';
import { MockExamSubjectsController } from './mock-exam-subjects.controller';
import { MockExamSubjectsService } from './mock-exam-subjects.service';
import { MockExamParticipantsController } from './mock-exam-participants.controller';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { MockExamResultsController } from './mock-exam-results.controller';
import { MockExamResultsService } from './mock-exam-results.service';
import { MockExamGatewayBillingService } from './mock-exam-gateway-billing.service';
import { MockExamBillingService } from './mock-exam-billing.service';
import { MockExamPdfService } from './mock-exam-pdf.service';
import { MockExamDeadlineCronService } from './mock-exam-deadline-cron.service';
import { UploadModule } from '../upload/upload.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [UploadModule, TransactionsModule],
  controllers: [
    MockExamSectionsController,
    MockExamsController,
    MockExamSubjectsController,
    MockExamParticipantsController,
    MockExamResultsController,
  ],
  providers: [
    MockExamSectionsService,
    MockExamsService,
    MockExamSubjectsService,
    MockExamParticipantsService,
    MockExamResultsService,
    MockExamGatewayBillingService,
    MockExamBillingService,
    MockExamPdfService,
    MockExamDeadlineCronService,
  ],
  exports: [
    MockExamSectionsService,
    MockExamsService,
    MockExamSubjectsService,
    MockExamParticipantsService,
    MockExamResultsService,
    MockExamGatewayBillingService,
    MockExamBillingService,
    MockExamPdfService,
  ],
})
export class MockExamsModule {}

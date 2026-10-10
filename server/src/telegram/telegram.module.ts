import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { TelegramController } from './telegram.controller';
import { TelegramChannelReportController } from './telegram-channel-report.controller';
import { TelegramStatementController } from './telegram-statement.controller';
import { TelegramStatementService } from './telegram-statement.service';
import { MockExamAnnounceListener } from './mock-exam-announce.listener';
import { MockExamPaidListener } from './mock-exam-paid.listener';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { MockExamsModule } from '../mock-exams/mock-exams.module';
import { PaymentLinksModule } from '../payment-gateways/payment-links.module';
import { StatementsModule } from '../statements/statements.module';
import { StudentJoinRequestsModule } from '../student-join-requests/student-join-requests.module';

@Module({
  // PaymentLinksModule is the small leaf module that owns
  // PaymentLinkService — pulling in the full PaymentGatewaysModule here
  // would create a cycle (PaymentGatewaysModule → PaymentsModule →
  // BillingModule → TelegramModule).
  imports: [
    UploadModule,
    UsersModule,
    MockExamsModule,
    PaymentLinksModule,
    StatementsModule,
    StudentJoinRequestsModule,
  ],
  controllers: [
    TelegramController,
    TelegramChannelReportController,
    TelegramStatementController,
  ],
  providers: [
    TelegramService,
    TelegramStatementService,
    TelegramChannelGateStatsService,
    MockExamAnnounceListener,
    MockExamPaidListener,
  ],
  exports: [TelegramService, TelegramChannelGateStatsService],
})
export class TelegramModule {}

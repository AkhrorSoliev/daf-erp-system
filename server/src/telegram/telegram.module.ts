import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { MockExamAnnounceListener } from './mock-exam-announce.listener';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { MockExamsModule } from '../mock-exams/mock-exams.module';
import { PaymentLinksModule } from '../payment-gateways/payment-links.module';

@Module({
  // PaymentLinksModule is the small leaf module that owns
  // PaymentLinkService — pulling in the full PaymentGatewaysModule here
  // would create a cycle (PaymentGatewaysModule → PaymentsModule →
  // BillingModule → TelegramModule).
  imports: [UploadModule, UsersModule, MockExamsModule, PaymentLinksModule],
  controllers: [TelegramController],
  providers: [TelegramService, MockExamAnnounceListener],
  exports: [TelegramService],
})
export class TelegramModule {}

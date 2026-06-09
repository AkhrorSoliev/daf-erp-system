import { Module } from '@nestjs/common';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { PaymentPromisesModule } from '../payment-promises/payment-promises.module';

@Module({
  // PrismaModule and EntityHistoryModule are global. PaymentPromisesModule is
  // imported for the "To'laydi" + sana flow (creates/updates a payment promise).
  imports: [PaymentPromisesModule],
  controllers: [CallLogsController],
  providers: [CallLogsService],
})
export class CallLogsModule {}

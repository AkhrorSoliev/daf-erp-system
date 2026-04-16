import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewayEventService } from './gateway-event.service';
import { PaymeService } from './payme/payme.service';
import { PaymeMethodsService } from './payme/payme-methods.service';
import { PaymeCronService } from './payme/payme-cron.service';
import { ClickService } from './click.service';
import { UzumService } from './uzum.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [GatewaysController],
  providers: [
    GatewayEventService,
    PaymeService,
    PaymeMethodsService,
    PaymeCronService,
    ClickService,
    UzumService,
  ],
})
export class PaymentGatewaysModule {}

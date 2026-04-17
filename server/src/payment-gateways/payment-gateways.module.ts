import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewayEventService } from './gateway-event.service';
import { GatewayConfigService } from './gateway-config.service';
import { PaymeService } from './payme/payme.service';
import { PaymeMethodsService } from './payme/payme-methods.service';
import { PaymeCronService } from './payme/payme-cron.service';
import { ClickService } from './click/click.service';
import { ClickMethodsService } from './click/click-methods.service';
import { ClickCronService } from './click/click-cron.service';
import { UzumService } from './uzum.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [GatewaysController],
  providers: [
    GatewayEventService,
    GatewayConfigService,
    PaymeService,
    PaymeMethodsService,
    PaymeCronService,
    ClickService,
    ClickMethodsService,
    ClickCronService,
    UzumService,
  ],
  exports: [GatewayConfigService],
})
export class PaymentGatewaysModule {}

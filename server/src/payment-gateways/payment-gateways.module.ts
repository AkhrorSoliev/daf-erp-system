import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewayEventService } from './gateway-event.service';
import { GatewayEventsService } from './gateway-events.service';
import { GatewayConfigService } from './gateway-config.service';
import { PaymeService } from './payme/payme.service';
import { PaymeMethodsService } from './payme/payme-methods.service';
import { ClickService } from './click/click.service';
import { ClickMethodsService } from './click/click-methods.service';
import { UzumService } from './uzum.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [GatewaysController],
  providers: [
    GatewayEventService,
    GatewayEventsService,
    GatewayConfigService,
    PaymeService,
    PaymeMethodsService,
    ClickService,
    ClickMethodsService,
    UzumService,
  ],
  exports: [GatewayConfigService],
})
export class PaymentGatewaysModule {}

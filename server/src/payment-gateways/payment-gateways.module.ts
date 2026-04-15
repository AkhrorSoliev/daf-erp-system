import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewayEventService } from './gateway-event.service';
import { PaymeService } from './payme.service';
import { ClickService } from './click.service';
import { UzumService } from './uzum.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [GatewaysController],
  providers: [GatewayEventService, PaymeService, ClickService, UzumService],
})
export class PaymentGatewaysModule {}

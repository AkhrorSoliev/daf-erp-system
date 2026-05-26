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
import { PaymentLinksModule } from './payment-links.module';
import { PaymentsModule } from '../payments/payments.module';
import { MockExamsModule } from '../mock-exams/mock-exams.module';

@Module({
  // PaymentLinksModule is the leaf module that owns GatewayConfigService
  // + PaymentLinkService. We re-export it so existing consumers of
  // PaymentGatewaysModule (e.g. StudentsModule using GatewayConfigService)
  // keep working without import changes.
  imports: [PaymentsModule, MockExamsModule, PaymentLinksModule],
  controllers: [GatewaysController],
  providers: [
    GatewayEventService,
    GatewayEventsService,
    PaymeService,
    PaymeMethodsService,
    ClickService,
    ClickMethodsService,
    UzumService,
  ],
  exports: [PaymentLinksModule],
})
export class PaymentGatewaysModule {}

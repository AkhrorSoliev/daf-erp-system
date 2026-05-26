import { Module } from '@nestjs/common';
import { GatewayConfigService } from './gateway-config.service';
import { PaymentLinkService } from './payment-link.service';

/**
 * Leaf module — provides the gateway config resolver and the checkout-URL
 * builder. Carved out of `PaymentGatewaysModule` so consumers that only
 * need to build a Click/Payme link (e.g. the Telegram bot scene) don't
 * have to import the full payment gateway stack, which would pull in
 * PaymentsModule → BillingModule → TelegramModule → … (cycle).
 *
 * No module imports here: `GatewayConfigService` and `PaymentLinkService`
 * depend only on the globally-registered `PrismaService` and
 * `ConfigService`.
 */
@Module({
  providers: [GatewayConfigService, PaymentLinkService],
  exports: [GatewayConfigService, PaymentLinkService],
})
export class PaymentLinksModule {}

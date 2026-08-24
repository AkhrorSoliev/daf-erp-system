import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GatewayConfigService } from './gateway-config.service';
import {
  buildClickCheckoutUrl,
  buildPaymeCheckoutUrl,
} from './checkout-url.util';

export interface PaymentLinks {
  payme: string | null;
  click: string | null;
  /** so'm — the amount the user will pay. */
  amount: number;
  /** 5-digit identity used by both gateways. */
  accountId: number;
}

/**
 * Builds Payme / Click deep-link checkout URLs for a mock exam
 * participant. The same `accountId` (= participant.publicId) is used in
 * both URLs because the webhook routing layer recognizes the publicId
 * from the shared Student sequence and dispatches to the mock billing
 * path automatically.
 *
 * Returned URLs are universal links — open in the provider's app when
 * installed on the user's phone, otherwise fall through to the web
 * checkout page.
 */
@Injectable()
export class PaymentLinkService {
  private readonly logger = new Logger(PaymentLinkService.name);

  constructor(
    private prisma: PrismaService,
    private gatewayConfig: GatewayConfigService,
    private config: ConfigService,
  ) {}

  async forMockParticipant(participantId: string): Promise<PaymentLinks> {
    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: { id: participantId, deletedAt: null },
      select: {
        publicId: true,
        paid: true,
        feeAmount: true,
        companyId: true,
        exam: { select: { price: true, status: true } },
      },
    });
    if (!participant) {
      throw new NotFoundException('Ishtirokchi topilmadi');
    }

    // Charge the fee locked in at registration (after any DaF discount);
    // legacy rows fall back to the exam's current price.
    const amount = participant.feeAmount ?? participant.exam.price;
    return this.buildLinks(participant.publicId, amount, participant.companyId);
  }

  /**
   * Lower-level builder for callers that already have `accountId` +
   * `amount` (so'm). Bot scenes use this right after creating a
   * participant to avoid the extra round-trip back to the DB.
   *
   * `companyId` is required rather than defaulted. It selects the merchant
   * credentials the checkout URL is built from, so a wrong value does not fail
   * loudly — it produces a working-looking Payme link that sends the payer's
   * money to another tenant's merchant account. It used to be hardcoded to
   * 1001; every caller has the owning row in hand and can say which.
   */
  async buildLinks(
    accountId: number,
    amountSom: number,
    companyId: number,
  ): Promise<PaymentLinks> {
    if (amountSom <= 0) {
      return { payme: null, click: null, amount: 0, accountId };
    }

    const [payme, click] = await Promise.all([
      this.buildPayme(accountId, amountSom, companyId),
      this.buildClick(accountId, amountSom, companyId),
    ]);

    return { payme, click, amount: amountSom, accountId };
  }

  private async buildPayme(
    accountId: number,
    amountSom: number,
    companyId: number,
  ): Promise<string | null> {
    try {
      const cfg = await this.gatewayConfig.getConfig(
        companyId,
        PaymentMethod.PAYME,
      );
      if (!cfg) return null;

      const isProduction = this.config.get<string>('NODE_ENV') === 'production';
      return buildPaymeCheckoutUrl({
        merchantId: cfg.merchantId,
        accountId,
        amountTiyin: amountSom * 100,
        isProduction,
        returnUrl: this.buildReturnUrl(),
      });
    } catch (err) {
      this.logger.warn(
        `Payme checkout URL build failed for accountId=${accountId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async buildClick(
    accountId: number,
    amountSom: number,
    companyId: number,
  ): Promise<string | null> {
    try {
      const cfg = await this.gatewayConfig.getConfig(
        companyId,
        PaymentMethod.CLICK,
      );
      if (!cfg) return null;

      const serviceId =
        this.config.get<string>('CLICK_SERVICE_ID') ?? cfg.secretKey;
      const merchantUserId = this.config.get<string>('CLICK_MERCHANT_USER_ID');
      if (!serviceId) return null;

      return buildClickCheckoutUrl({
        serviceId,
        merchantId: cfg.merchantId,
        accountId,
        amountSom,
        returnUrl: this.buildReturnUrl() ?? undefined,
        merchantUserId,
      });
    } catch (err) {
      this.logger.warn(
        `Click checkout URL build failed for accountId=${accountId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Where the user lands after Payme/Click finishes. We point back to the
   * Telegram bot so payers can pick up the success message. Returns null
   * when the bot username isn't configured.
   */
  private buildReturnUrl(): string | null {
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (!botUsername) return null;
    return `https://t.me/${botUsername}`;
  }
}

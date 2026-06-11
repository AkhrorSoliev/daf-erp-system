import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Returns true when NODE_ENV is 'production'. */
const isProduction = (config: ConfigService) =>
  config.get<string>('NODE_ENV') === 'production';

export interface MerchantConfig {
  merchantId: string;
  secretKey: string;
  secretKeyTest?: string | null;
}

/**
 * Resolves merchant credentials per company + provider.
 *
 * Lookup order:
 * 1. Database (PaymentGatewayConfig) — per-company config
 * 2. Environment variables — global fallback
 *
 * This allows gradual migration: companies that have DB config use it,
 * others fall back to the global env vars.
 */
@Injectable()
export class GatewayConfigService {
  private readonly logger = new Logger(GatewayConfigService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getConfig(
    companyId: number,
    provider: PaymentMethod,
  ): Promise<MerchantConfig | null> {
    // 1. Try per-company DB config
    const dbConfig = await this.prisma.paymentGatewayConfig.findUnique({
      where: { companyId_provider: { companyId, provider } },
    });

    if (dbConfig) {
      // A config row exists for this company+provider. An INACTIVE row means
      // the gateway is intentionally OFF — do NOT silently fall back to the
      // deploy-wide env credentials, which would process this company's
      // webhooks under keys that don't belong to it. (F-20)
      if (!dbConfig.isActive) return null;
      return {
        merchantId: dbConfig.merchantId,
        secretKey: dbConfig.secretKey,
        // Never expose the sandbox key on the production code path — a request
        // signed with the (less-protected, shared) test key must not
        // authenticate a real prod webhook. (F-18)
        secretKeyTest: isProduction(this.config)
          ? null
          : dbConfig.secretKeyTest,
      };
    }

    // 2. No DB row → global env fallback (gradual-migration path).
    return this.getEnvFallback(provider);
  }

  private getEnvFallback(provider: PaymentMethod): MerchantConfig | null {
    switch (provider) {
      case PaymentMethod.PAYME: {
        const merchantId = this.config.get<string>('PAYME_MERCHANT_ID');
        if (!merchantId) return null;

        const prodKey = this.config.get<string>('PAYME_MERCHANT_KEY');
        const testKey = this.config.get<string>('PAYME_MERCHANT_KEY_TEST');

        // Production requires the prod key; dev/test can work with test key alone
        if (isProduction(this.config) && !prodKey) return null;
        if (!prodKey && !testKey) return null;

        return {
          merchantId,
          secretKey: prodKey ?? testKey!,
          // Never expose the sandbox key on the production code path. (F-18)
          secretKeyTest: isProduction(this.config) ? null : testKey,
        };
      }
      case PaymentMethod.CLICK: {
        const merchantId = this.config.get<string>('CLICK_MERCHANT_ID');
        const serviceId = this.config.get<string>('CLICK_SERVICE_ID');
        const secretKey = this.config.get<string>('CLICK_SECRET_KEY');
        if (!merchantId || !serviceId || !secretKey) return null;
        return { merchantId, secretKey };
      }
      default:
        return null;
    }
  }
}

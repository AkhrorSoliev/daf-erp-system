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

    if (dbConfig?.isActive) {
      return {
        merchantId: dbConfig.merchantId,
        secretKey: dbConfig.secretKey,
        secretKeyTest: dbConfig.secretKeyTest,
      };
    }

    // 2. Fall back to global env vars
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
          secretKeyTest: testKey,
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

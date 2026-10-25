import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { RedisService } from '../redis/redis.service';
import { invalidateNetProfitCache } from '../reports/net-profit-cache';
import type { SettingKey } from '../settings/settings.types';
import {
  BANK_TIERS_KEY,
  DatedRate,
  DatedTiers,
  TAX_RATE_KEYS,
  TAX_SETTING_KEYS,
  TaxRateKey,
  TaxSettingKey,
} from './tax-rates';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';

export type TaxRateBook = {
  rates: Record<TaxRateKey, DatedRate[]>;
  bankTiers: DatedTiers[];
};
export type TaxSettingsView = {
  values: Record<TaxSettingKey, DatedRate[] | DatedTiers[]>;
  filled: number;
  total: number;
};

@Injectable()
export class TaxSettingsService {
  constructor(
    private readonly settings: SettingsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async loadRates(companyId: number): Promise<TaxRateBook> {
    const lists = await Promise.all(
      TAX_RATE_KEYS.map((k) => this.settings.get(companyId, k)),
    );
    const rates = Object.fromEntries(
      TAX_RATE_KEYS.map((k, i) => [k, lists[i]]),
    ) as Record<TaxRateKey, DatedRate[]>;
    const bankTiers = await this.settings.get(companyId, BANK_TIERS_KEY);
    return { rates, bankTiers };
  }

  async read(companyId: number): Promise<TaxSettingsView> {
    const { rates, bankTiers } = await this.loadRates(companyId);
    const values = {
      ...rates,
      [BANK_TIERS_KEY]: bankTiers,
    } as TaxSettingsView['values'];
    const filled = TAX_SETTING_KEYS.filter((k) => values[k].length > 0).length;
    return { values, filled, total: TAX_SETTING_KEYS.length };
  }

  async update(
    companyId: number,
    dto: UpdateTaxSettingsDto,
    userId: number,
  ): Promise<TaxSettingsView> {
    const entries = Object.entries(dto.values);
    if (entries.length === 0)
      throw new BadRequestException("O'zgartirish yo'q");
    const foreign = entries
      .map(([k]) => k)
      .filter((k) => !(TAX_SETTING_KEYS as readonly string[]).includes(k));
    if (foreign.length)
      throw new BadRequestException(`Noma'lum kalit: ${foreign.join(', ')}`);
    await this.settings.setMany(
      companyId,
      entries as [SettingKey, unknown][],
      userId,
    );
    await invalidateNetProfitCache(this.redis, companyId);
    return this.read(companyId);
  }
}

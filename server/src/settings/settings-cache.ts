import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';

/**
 * Kompaniyaning barcha `Setting` qatorlarini keshlaydi (bitta so'rov, filial
 * bo'yicha ham) — `net-profit-cache.ts` bilan bir xil naqsh (`server/CLAUDE.md`
 * ko'rsatgan "house pattern").
 *
 * Nega bitta kompaniya darajasida, bitta kalit darajasida emas: panel
 * `getMany`ni ham chaqiradi (barcha kalitlar birdan), billing esa `get`ni har
 * yozilish uchun chaqiradi (oylik cron 370+ yozilish) — ikkalasi ham bitta
 * keshlangan ro'yxatdan o'qiydi, N+1 emas.
 *
 * TTL qisqa (5 daqiqa): sozlama kamdan-kam o'zgaradi, lekin CEO uni
 * o'zgartirganda keyingi billing chaqiruvi eskisini ko'rmasligi kerak —
 * shuning uchun `set()` yozishda keshni FAOL o'chiradi (`invalidate...`),
 * TTL esa faqat shu o'chirish ishlamay qolgan holatlar uchun orqa fon.
 *
 * Redis o'chsa — o'qish bazadan davom etadi, hech qachon xato tashlamaydi.
 */
const TTL_SECONDS = 300;
const logger = new Logger('SettingsCache');

export function settingsCacheKey(companyId: number): string {
  return `settings:company:${companyId}`;
}

export interface CachedSettingRow {
  key: string;
  branchId: number | null;
  value: unknown;
}

export async function cachedCompanySettingRows(
  redis: RedisService | undefined,
  companyId: number,
  compute: () => Promise<CachedSettingRow[]>,
): Promise<CachedSettingRow[]> {
  const key = settingsCacheKey(companyId);

  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit !== null) return JSON.parse(hit) as CachedSettingRow[];
    } catch (e) {
      logger.warn(`Cache read failed for ${key}: ${e}`);
    }
  }

  const rows = await compute();

  if (redis) {
    try {
      await redis.setex(key, TTL_SECONDS, JSON.stringify(rows));
    } catch (e) {
      logger.warn(`Cache write failed for ${key}: ${e}`);
    }
  }

  return rows;
}

export async function invalidateCompanySettingsCache(
  redis: RedisService | undefined,
  companyId: number,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(settingsCacheKey(companyId));
  } catch (e) {
    logger.warn(
      `Cache invalidate failed for ${settingsCacheKey(companyId)}: ${e}`,
    );
  }
}

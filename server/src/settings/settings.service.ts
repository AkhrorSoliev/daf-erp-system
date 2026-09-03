import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  SETTING_KEYS,
  SettingKey,
  SettingValueMap,
  getSettingDefinition,
} from './settings.types';
import {
  CachedSettingRow,
  cachedCompanySettingRows,
  invalidateCompanySettingsCache,
} from './settings-cache';

/**
 * `/settings` panelining va billing servislarining yagona kirish nuqtasi.
 *
 * Chaqiruvchi hech qachon `Setting.value` (Json)ni to'g'ridan-to'g'ri
 * ko'rmaydi — har doim `SETTING_DEFINITIONS`dan o'tgan tipli qiymat oladi.
 * `get()` HECH QACHON `undefined` qaytarmaydi: qator yo'q bo'lsa registrdagi
 * boshlang'ich qiymat qaytadi.
 *
 * Ustunlik tartibi: filial qiymati > kompaniya qiymati > kod ichidagi
 * boshlang'ich qiymat (`SETTING_DEFINITIONS`).
 */
@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  private async loadRows(companyId: number): Promise<CachedSettingRow[]> {
    return cachedCompanySettingRows(this.redis, companyId, async () => {
      const rows = await this.prisma.setting.findMany({
        where: { companyId },
        select: { key: true, branchId: true, value: true },
      });
      return rows;
    });
  }

  private resolveRaw(
    rows: CachedSettingRow[],
    key: SettingKey,
    branchId?: number,
  ): unknown {
    if (branchId != null) {
      const branchRow = rows.find(
        (r) => r.key === key && r.branchId === branchId,
      );
      if (branchRow) return branchRow.value;
    }
    const companyRow = rows.find((r) => r.key === key && r.branchId === null);
    return companyRow?.value;
  }

  /**
   * Bitta kalitni tipli qiymat sifatida o'qiydi. `undefined` HECH QACHON
   * qaytmaydi — qator topilmasa registrdagi boshlang'ich qiymat qaytadi.
   */
  async get<K extends SettingKey>(
    companyId: number,
    key: K,
    branchId?: number,
  ): Promise<SettingValueMap[K]> {
    const def = getSettingDefinition(key);
    const rows = await this.loadRows(companyId);
    const raw = this.resolveRaw(rows, key, branchId);
    return raw === undefined ? def.defaultValue : def.parse(raw);
  }

  /**
   * Panel uchun — BARCHA sozlangan kalitlarni bitta so'rovda qaytaradi (bitta
   * kalit uchun bitta so'rov emas).
   */
  async getMany(
    companyId: number,
    branchId?: number,
  ): Promise<SettingValueMap> {
    const rows = await this.loadRows(companyId);
    const result = {} as SettingValueMap;
    for (const key of SETTING_KEYS) {
      const def = getSettingDefinition(key);
      const raw = this.resolveRaw(rows, key, branchId);
      // TypeScript `SettingValueMap[key]`ni union kalit bo'yicha `never`ga
      // toraytiradi (har kalitning tipi har xil). Qiymat `def.parse` orqali
      // allaqachon tekshirilgan, shuning uchun bu yerda cast xavfsiz.
      (result as Record<SettingKey, unknown>)[key] =
        raw === undefined ? def.defaultValue : def.parse(raw);
    }
    return result;
  }

  /**
   * Har bir sozlama kaliti uchun — qaysi filiallarda o'ZIGA XOS (kompaniya
   * darajasidan farqli) qiymat saqlangan.
   *
   * Faqat CEOning kompaniya darajasidagi ko'rinishi uchun: Branch Director
   * har doim o'z filialiga qulflanadi (`SettingsController.
   * resolveReadBranchId`), shuning uchun ular buni hech qachon so'ramaydi.
   * Buning yo'qligi muammo edi — BDning saqlagan override'i CEO ekranida
   * ko'rinmas edi, panel "bitta qiymat" deb ko'rsatardi, holbuki filialda
   * boshqacha ishlayotgan bo'lishi mumkin edi.
   *
   * Xuddi shu keshlangan qatorlardan foydalanadi (`loadRows`) — alohida
   * so'rov QO'SHMAYDI.
   */
  async getBranchOverrides(
    companyId: number,
  ): Promise<Record<SettingKey, number[]>> {
    const rows = await this.loadRows(companyId);
    const result = {} as Record<SettingKey, number[]>;
    for (const key of SETTING_KEYS) {
      result[key] = rows
        .filter((r) => r.key === key && r.branchId != null)
        .map((r) => r.branchId as number)
        .sort((a, b) => a - b);
    }
    return result;
  }

  /**
   * Bitta sozlamani yozadi. `value` registr bo'yicha tekshiriladi — noto'g'ri
   * qiymat lotin-o'zbekcha xabar bilan rad etiladi.
   *
   * `upsert` EMAS: `@@unique([companyId, branchId, key])` nullable
   * `branchId`ni o'z ichiga oladi, Postgres esa UNIQUE indeksda NULL'larni
   * har doim boshqacha deb hisoblaydi — `upsert`ning `where`i kompaniya
   * darajasidagi (branchId=null) mavjud qatorga hech qachon mos kelmay,
   * har safar INSERT'ga urinib, qisman indeks (`setting_company_row_unique`)
   * tomonidan rad etilardi. `DailyFinancialSnapshot`dagi bilan bir xil
   * `findFirst` + create/update naqshi ishlatiladi.
   */
  async set<K extends SettingKey>(
    companyId: number,
    key: K,
    rawValue: unknown,
    updatedById: number | undefined,
    branchId?: number,
  ): Promise<SettingValueMap[K]> {
    const def = getSettingDefinition(key);
    // Filial darajasida hech qachon o'qilmaydigan sozlama filial darajasida
    // yozilsa — "saqlandi" deb ko'rsatib, hech qachon ishlatilmaydigan
    // dekorativ boshqaruvga aylanadi. Shu yerda, YAGONA yozish nuqtasida
    // to'sib qo'yiladi — CEO ham, Branch Director ham (BDning yozishi
    // kontrollerda har doim o'z filialiga qulflanadi, shuning uchun bu
    // amalda BD uchun HAR QANDAY yozishni rad etadi).
    if (def.companyLevelOnly && branchId != null) {
      throw new BadRequestException(
        `${key} faqat kompaniya darajasida sozlanadi — filial darajasida alohida qiymatga ega emas`,
      );
    }
    const value = def.parse(rawValue);
    const resolvedBranchId = branchId ?? null;

    const existing = await this.prisma.setting.findFirst({
      where: { companyId, branchId: resolvedBranchId, key },
    });

    const jsonValue = value as Prisma.InputJsonValue;

    if (existing) {
      const updated = await this.prisma.setting.update({
        where: { id: existing.id },
        data: { value: jsonValue, updatedById },
      });
      await this.entityHistoryService.recordUpdate({
        entityType: 'Setting',
        entityId: updated.id,
        oldValues: { key: existing.key, branchId: existing.branchId, value: existing.value },
        newValues: { key: updated.key, branchId: updated.branchId, value: updated.value },
        changedById: updatedById,
        companyId,
      });
    } else {
      const created = await this.prisma.setting.create({
        data: {
          companyId,
          branchId: resolvedBranchId,
          key,
          value: jsonValue,
          updatedById,
        },
      });
      await this.entityHistoryService.recordCreate({
        entityType: 'Setting',
        entityId: created.id,
        newValues: { key: created.key, branchId: created.branchId, value: created.value },
        changedById: updatedById,
        companyId,
      });
    }

    await invalidateCompanySettingsCache(this.redis, companyId);

    return value;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { UpdateAbsencePauseSettingsDto } from './dto/update-absence-pause-settings.dto';

export interface AbsencePauseSettings {
  enabled: boolean;
  warnThreshold: number;
  pauseThreshold: number;
  dailyCap: number;
}

/**
 * Avtomatik pauza qoidasining sozlamasi — kompaniyaga bitta qator.
 *
 * NEGA SOZLAMA, QATTIQ RAQAM EMAS: 2026-07-14 da avtomatik guruh yopish
 * kutilmagan natija bergani uchun butunlay o'chirilgan edi, va o'chirish
 * uchun deploy kerak bo'lgandi. Bu safar o'chirish tugmasi ham, chegaralar
 * ham CEO qo'lida — dasturchisiz.
 */
@Injectable()
export class AbsencePauseSettingService {
  constructor(
    private prisma: PrismaService,
    private entityHistory: EntityHistoryService,
  ) {}

  /**
   * Sozlamani o'qiydi; qator bo'lmasa O'CHIQ holda yaratadi.
   *
   * Seed emas, lazy create: migratsiya bilan qator kelsa «yoqilganmi?»
   * degan savol deploy paytida tug'ilardi. Bu yerda javob doim bir xil —
   * yangi kompaniya ham, migratsiyadan keyingi birinchi o'qish ham
   * `enabled: false` beradi.
   */
  async get(companyId: number): Promise<AbsencePauseSettings> {
    const row = await this.prisma.absencePauseSetting.findUnique({
      where: { companyId },
    });
    if (row) return this.toSettings(row);

    const created = await this.prisma.absencePauseSetting.create({
      data: { companyId, enabled: false },
    });
    return this.toSettings(created);
  }

  async update(
    companyId: number,
    dto: UpdateAbsencePauseSettingsDto,
    userId: number,
  ): Promise<AbsencePauseSettings> {
    const current = await this.get(companyId);
    const next: AbsencePauseSettings = {
      enabled: dto.enabled ?? current.enabled,
      warnThreshold: dto.warnThreshold ?? current.warnThreshold,
      pauseThreshold: dto.pauseThreshold ?? current.pauseThreshold,
      dailyCap: dto.dailyCap ?? current.dailyCap,
    };

    // Teng yoki katta bo'lsa ogohlantirish pauza bilan bir kunda ketadi —
    // o'quvchi xabarni muzlatilgandan KEYIN olardi, ya'ni ogohlantirishning
    // butun ma'nosi yo'qolardi.
    if (next.warnThreshold >= next.pauseThreshold) {
      throw new BadRequestException(
        "Ogohlantirish chegarasi pauza chegarasidan kichik bo'lishi kerak",
      );
    }

    const data: Record<string, unknown> = { updatedById: userId };
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.warnThreshold !== undefined) data.warnThreshold = dto.warnThreshold;
    if (dto.pauseThreshold !== undefined)
      data.pauseThreshold = dto.pauseThreshold;
    if (dto.dailyCap !== undefined) data.dailyCap = dto.dailyCap;

    const updated = await this.prisma.absencePauseSetting.update({
      where: { companyId },
      data,
    });

    // Bu tugma pul oqimini to'xtatadi (yoki qayta yoqadi) — kim, qachon
    // va nimani o'zgartirgani yozilib borsin.
    await this.entityHistory.recordUpdate({
      entityType: 'AbsencePauseSetting',
      entityId: companyId,
      oldValues: { ...current },
      newValues: { ...next },
      changedById: userId,
      companyId,
    });

    return this.toSettings(updated);
  }

  private toSettings(row: {
    enabled: boolean;
    warnThreshold: number;
    pauseThreshold: number;
    dailyCap: number;
  }): AbsencePauseSettings {
    return {
      enabled: row.enabled,
      warnThreshold: row.warnThreshold,
      pauseThreshold: row.pauseThreshold,
      dailyCap: row.dailyCap,
    };
  }
}

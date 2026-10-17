import { BadRequestException, Injectable } from '@nestjs/common';
import { KpiRuleMode } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../settings/settings.types';
import type { KpiRule, KpiSettings } from './kpi-rules';

export interface KpiSettingsPatch {
  enabled?: boolean;
  leadPaid?: KpiRule;
  promiseKept?: KpiRule;
}

/** A percent above 100 is refused; so'm bounds are the setting's own parse. */
function assertRule(rule: KpiRule): void {
  if (rule.mode === KpiRuleMode.PERCENT && rule.value > 100) {
    throw new BadRequestException("Foiz 0 dan 100 gacha bo'lishi kerak");
  }
}

/**
 * KPI prices and the switch (spec §7.4), company-level. The switch row is
 * written only when the switch flips, so its last write is the flip.
 */
@Injectable()
export class KpiSettingsService {
  constructor(private settings: SettingsService) {}

  async read(companyId: number): Promise<KpiSettings> {
    const [enabled, lpMode, lpValue, pkMode, pkValue, changedAt] =
      await Promise.all([
        this.settings.get(companyId, 'kpi.enabled'),
        this.settings.get(companyId, 'kpi.leadPaid.mode'),
        this.settings.get(companyId, 'kpi.leadPaid.value'),
        this.settings.get(companyId, 'kpi.promiseKept.mode'),
        this.settings.get(companyId, 'kpi.promiseKept.value'),
        this.settings.lastWrittenAt(companyId, 'kpi.enabled'),
      ]);
    return {
      enabled,
      changedAt,
      leadPaid: { mode: lpMode, value: lpValue },
      promiseKept: { mode: pkMode, value: pkValue },
    };
  }

  async update(
    companyId: number,
    patch: KpiSettingsPatch,
    userId: number,
  ): Promise<KpiSettings> {
    if (patch.enabled === undefined && !patch.leadPaid && !patch.promiseKept) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    if (patch.leadPaid) assertRule(patch.leadPaid);
    if (patch.promiseKept) assertRule(patch.promiseKept);

    const current = await this.read(companyId);
    const entries: [SettingKey, unknown][] = [];
    if (patch.enabled !== undefined && patch.enabled !== current.enabled) {
      entries.push(['kpi.enabled', patch.enabled]);
    }
    if (patch.leadPaid) {
      entries.push(
        ['kpi.leadPaid.mode', patch.leadPaid.mode],
        ['kpi.leadPaid.value', patch.leadPaid.value],
      );
    }
    if (patch.promiseKept) {
      entries.push(
        ['kpi.promiseKept.mode', patch.promiseKept.mode],
        ['kpi.promiseKept.value', patch.promiseKept.value],
      );
    }
    // One transaction: a rule's mode and value are never seen apart.
    if (entries.length > 0)
      await this.settings.setMany(companyId, entries, userId);
    return this.read(companyId);
  }
}

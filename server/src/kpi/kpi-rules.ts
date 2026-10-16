import { KpiResultType, KpiRuleMode } from '@prisma/client';
import { formatSom } from '../payments/shared/format-som';

/**
 * The rules of a KPI result (ADR-0094, spec §7). Pure: the writer, the read
 * side and the backfill share them.
 */

/** Results are counted from this instant: 17.10.2026 00:00 Tashkent (spec §7.1/9). */
export const KPI_START = new Date('2026-10-17T00:00:00+05:00');

/** The first month the KPI pages offer. */
export const KPI_FIRST_MONTH = '2026-10';

/** Why a result was cancelled (spec §7.3). */
export const CANCEL_REASON = {
  REVERSED: "To'lov bekor qilindi",
  CORRECTED: "To'lov tuzatildi",
} as const;

export interface KpiRule {
  mode: KpiRuleMode;
  value: number;
}

export interface KpiSettings {
  enabled: boolean;
  /** When the switch last flipped; null = never. */
  changedAt: Date | null;
  leadPaid: KpiRule;
  promiseKept: KpiRule;
}

/** A fixed rule is its sum; a percent is `round(base × value / 100)` so'm (spec §7.4). */
export function kpiAmount(rule: KpiRule, base: number): number {
  return rule.mode === KpiRuleMode.FIXED
    ? rule.value
    : Math.round((base * rule.value) / 100);
}

/**
 * From when new results are written: KPI_START, or the moment the switch came
 * back on. Null = the switch is off. A payment made before this instant never
 * earns a result later — an off period is not filled in (spec §7.2).
 */
export function recordingSince(
  s: Pick<KpiSettings, 'enabled' | 'changedAt'>,
): Date | null {
  if (!s.enabled) return null;
  return s.changedAt && s.changedAt > KPI_START ? s.changedAt : KPI_START;
}

/** Spec §7.1/1: an Administrator, and neither CEO nor Branch Director. */
export function isKpiEligible(roleNames: readonly string[]): boolean {
  return (
    roleNames.includes('Administrator') &&
    !roleNames.includes('CEO') &&
    !roleNames.includes('Branch Director')
  );
}

/** «Qanday hisoblandi» (spec §7.8): the server writes it, the page prints it. */
export function explainKpi(r: {
  type: KpiResultType;
  ruleMode: KpiRuleMode;
  ruleValue: number;
  baseAmount: number;
}): string {
  if (r.ruleMode === KpiRuleMode.FIXED) return "qat'iy summa";
  const base = formatSom(r.baseAmount);
  return r.type === KpiResultType.LEAD_PAID
    ? `birinchi to'lov ${base} × ${r.ruleValue}%`
    : `qarz ${base} × ${r.ruleValue}%`;
}

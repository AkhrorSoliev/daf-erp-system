import { tashkentMonthKey } from '../../common/date/tashkent';
import {
  FixedMonthlyVersion,
  prorateFixedMonthly,
} from './prorate-fixed-monthly';

/** First month a correction may name (the payroll reporting floor, May 2026). */
export const ADJUSTMENT_FIRST_MONTH = '2026-05';

export interface StaffMonthly {
  /** What the person is owed for the month before advances. */
  amount: number;
  /** What the formula gives for the month. */
  calculated: number;
  /** True when the CEO's figure replaced the formula. */
  manual: boolean;
}

/**
 * The ONE place a non-teaching staff member's monthly pay is decided (ADR-0112):
 * the CEO's figure for the month when there is one, else the prorated
 * FIXED_MONTHLY formula. Its two readers are the payroll cron and the monthly
 * staff report, so the shown figure equals the paid one. Nothing else may call
 * `prorateFixedMonthly` (`staff-monthly-amount.single-source.spec.ts`).
 */
export function resolveStaffMonthly(input: {
  versions: FixedMonthlyVersion[];
  adjustment: { amount: number } | null;
  periodStart: Date;
  periodEnd: Date;
}): StaffMonthly {
  const calculated = prorateFixedMonthly(
    input.versions,
    input.periodStart,
    input.periodEnd,
  );
  return input.adjustment
    ? { amount: input.adjustment.amount, calculated, manual: true }
    : { amount: calculated, calculated, manual: false };
}

/** The month key of a payroll period (the period is the calendar month, ADR-0082). */
export function staffAdjustmentMonth(periodStart: Date): string {
  return tashkentMonthKey(periodStart);
}

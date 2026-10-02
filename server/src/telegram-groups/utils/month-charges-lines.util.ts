import type { MonthCharges } from '../../reports/month-charges';
import { formatSum } from './format.util';

/**
 * «Bu oy hisoblandi / To'landi / Qoldi» (ADR-0058) — the month's three lines
 * for a Telegram message. The figures are `ReportsService.getMonthCharges`'s,
 * printed as they come; nothing is recomputed here.
 *
 * Lives here rather than in either caller because BOTH money surfaces (the
 * 21:00 daily report and the «Moliyaviy xulosa» card) print it, and two copies
 * of the wording is how the two surfaces start disagreeing.
 */
export function buildMonthChargesLines(charges: MonthCharges): string[] {
  // `paidPct` is null only when nothing was charged. 0% is a real reading
  // (charged, nothing paid) and must print, so test for null, not falsiness.
  const share = charges.paidPct !== null ? ` (<b>${charges.paidPct}%</b>)` : '';
  return [
    `• Bu oy hisoblandi: <b>${formatSum(charges.charged)}</b>`,
    `• To'landi: <b>${formatSum(charges.paid)}</b>${share}`,
    `• Qoldi: <b>${formatSum(charges.unpaid)}</b>`,
  ];
}

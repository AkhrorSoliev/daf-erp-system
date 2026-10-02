import type { DepartureOutcome } from './monthly-charge.service';
import { formatSom } from '../payments/shared/format-som';

/**
 * The «pul» line of a departure's history rows (contract 6.2, ADR-0043):
 * what happened to the month's charge, and — when rule 6.2 kept it — the
 * share of the month that decided it, so the answer can be read back later.
 * Null when the enrollment had no month to settle (a lesson-pack course, or
 * no standing charge), and the history row then carries no «pul» at all.
 */
export function departureMoneyNote(
  outcome: DepartureOutcome | null,
): string | null {
  if (!outcome) return null;
  if (outcome.withheld) {
    const { held, covered, percent } = outcome.share;
    return `Shartnoma 6.2: oy darslarining ${percent}% o'tgan (${held}/${covered}) — oy to'lovi qaytarilmadi`;
  }
  if (outcome.refunded <= 0) return null;
  const sum = `${formatSom(outcome.refunded)} so'm`;
  if (outcome.trial) {
    return `Sinov darsi (3.5): oyning puli to'liq qaytarildi — ${sum}`;
  }
  switch (outcome.policy) {
    case 'QUALITY_CLAIM':
      return `Sifat bo'yicha shikoyat: oyning ${outcome.lessons} darsi puli to'liq qaytarildi — ${sum}`;
    case 'LEVEL_COMPLETED':
      return `Darajani tugatdi: o'tmagan ${outcome.lessons} dars puli qaytarildi — ${sum}`;
    case 'CENTER_INITIATIVE':
      return `Markaz tashabbusi: o'tmagan ${outcome.lessons} dars puli qaytarildi — ${sum}`;
    default:
      return `O'tmagan ${outcome.lessons} dars puli qaytarildi — ${sum}`;
  }
}

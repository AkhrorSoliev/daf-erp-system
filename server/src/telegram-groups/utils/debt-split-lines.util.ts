import type { DebtSplit } from '../../reports/debt-split';
import { formatNumber, formatSum } from './format.util';

/**
 * The debt as two numbers that are never added (ADR-0059), as a Telegram
 * message prints it: «O'qiyotganlar qarzi», under it its «shu oy» / «eski
 * qarz» split, then «O'qimayotganlar qarzi». The figures are
 * `ReportsService.getDebtSplit`'s, printed as they come; nothing is recomputed
 * here.
 *
 * Lives here rather than in any caller because FOUR surfaces print these lines
 * (the 21:00 report, the «Moliyaviy xulosa» card, /qarzdorlar and /stats), and
 * two copies of the wording is how surfaces start disagreeing — the card had
 * already drifted to «eski» for «eski qarz».
 *
 * `studyingSuffix` follows the first line (the 21:00 report's ▲/▼ against
 * yesterday). `bullet` is the surface's own: the report and the card print
 * «• », /qarzdorlar and /stats none.
 */
export function buildDebtSplitLines(
  split: DebtSplit,
  opts: { studyingSuffix?: string; bullet?: string } = {},
): string[] {
  const { studying, notStudying } = split;
  const bullet = opts.bullet ?? '• ';
  const lines = [
    `${bullet}O'qiyotganlar qarzi: <b>${formatNumber(studying.count)}</b> ta — <b>${formatSum(studying.total)}</b>${opts.studyingSuffix ?? ''}`,
  ];
  // Nobody studying owes: «shu oy 0 · eski qarz 0» would say nothing.
  if (studying.total !== 0) {
    lines.push(
      `   🟡 shu oy ${formatSum(studying.currentMonth)} · 🔴 eski qarz ${formatSum(studying.older)}`,
    );
  }
  lines.push(
    `${bullet}O'qimayotganlar qarzi: <b>${formatNumber(notStudying.count)}</b> ta — <b>${formatSum(notStudying.total)}</b>`,
  );
  return lines;
}

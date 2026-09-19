import { formatSum } from './format.util';

export interface IncomeSplitInput {
  /** The period's whole cash-in — `currentMonth + lateTotal` by construction. */
  total: number;
  /** Paid for the period's OWN month(s). */
  currentMonth: number;
  /** Paid against debt carried in from earlier months. */
  lateTotal: number;
  /** Which earlier months that debt belonged to, most recent first. */
  late: Array<{ label: string; amount: number }>;
}

/**
 * The «Tushum tarkibi» lines printed under an income figure — the same split
 * the /payments/overview "Tushumlar" drill-down shows, rendered for Telegram.
 *
 * Lives here rather than in either caller because BOTH money surfaces (the
 * 21:00 daily report and the «Moliyaviy xulosa» card) print it; two copies of
 * the wording is how the two surfaces start disagreeing.
 *
 * The caller must pass the figures from ONE `getIncomeMonthAttribution` result
 * and print them under the `total` of that same result — these lines are a
 * decomposition of that number, so a headline taken from anywhere else can
 * fail to add up in front of the reader.
 */
export function buildIncomeSplitLines(split: IncomeSplitInput): string[] {
  // Nothing came in (a holiday, or the 1st before the first payment): a
  // "0 so'm (0%)" pair states nothing and divides by zero to say it.
  if (!(split.total > 0)) return [];
  if (split.lateTotal <= 0 || split.late.length === 0) {
    return ["   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q"];
  }
  // Derive the late share FROM 100 rather than rounding it on its own: two
  // independently-rounded percentages can print 32% + 67% directly underneath
  // a figure that claims they are the whole of it.
  const currentPct = Math.round((split.currentMonth / split.total) * 100);
  const latePct = 100 - currentPct;
  return [
    `   Shu oy uchun: <b>${formatSum(split.currentMonth)}</b> (${currentPct}%)`,
    `   Eski qarzlar uchun: <b>${formatSum(split.lateTotal)}</b> (${latePct}%)`,
    ...split.late.map(
      (m) => `      ${m.label} — <b>${formatSum(m.amount)}</b>`,
    ),
  ];
}

import { formatSum } from './format.util';

export interface IncomeSplitInput {
  /** The period's whole cash-in — `currentMonth + advance + lateTotal` by construction. */
  total: number;
  /** Paid for the period's OWN month(s). */
  currentMonth: number;
  /** Paid ahead for the next month: still on the balance at the period end. */
  advance: number;
  /** Paid against debt carried in from earlier months. */
  lateTotal: number;
  /** Which earlier months that debt belonged to, most recent first. */
  late: Array<{ label: string; amount: number }>;
}

/**
 * Whole-number shares of `amounts` that add up to exactly 100 (largest
 * remainder). Rounding each share on its own can print 33% + 33% + 33% under a
 * figure that claims they are all of it. A part that is 0 always gets 0.
 */
export function sharesOf100(amounts: readonly number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (!(total > 0)) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const shares = raw.map((r) => Math.floor(r));
  let left = 100 - shares.reduce((s, p) => s + p, 0);
  const byRest = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { i } of byRest) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

/**
 * The «Tushum tarkibi» lines printed under an income figure — the same split
 * the /payments/overview «Qayerdan keldi» dialog shows, rendered for Telegram:
 * «Shu oy uchun», «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun», then one
 * row per earlier month (ADR-0067). A part that is 0 is left out.
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
  const hasLate = split.lateTotal > 0 && split.late.length > 0;
  if (split.advance <= 0 && !hasLate) {
    return ["   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q"];
  }
  const [currentPct, advancePct, latePct] = sharesOf100([
    split.currentMonth,
    split.advance,
    split.lateTotal,
  ]);
  const lines: string[] = [];
  if (split.currentMonth > 0) {
    lines.push(
      `   Shu oy uchun: <b>${formatSum(split.currentMonth)}</b> (${currentPct}%)`,
    );
  }
  if (split.advance > 0) {
    lines.push(
      `   Oldindan (keyingi oy uchun): <b>${formatSum(split.advance)}</b> (${advancePct}%)`,
    );
  }
  if (hasLate) {
    lines.push(
      `   Eski qarzlar uchun: <b>${formatSum(split.lateTotal)}</b> (${latePct}%)`,
    );
    for (const m of split.late) {
      lines.push(`      ${m.label} — <b>${formatSum(m.amount)}</b>`);
    }
  }
  return lines;
}

import { tashkentMonthKey } from '../../src/common/date/tashkent';
import { nextSequence } from '../../src/receipts/receipt-code';

/**
 * Dry-run summary of the receipt-code backfill: per Tashkent year, how many
 * payments get a code and the first/last one. `missing` is sorted by
 * `createdAt`; `lastByPrefix` is each year's current global highest code.
 */
export function previewReceiptCodes(
  missing: { id: string; createdAt: Date }[],
  lastByPrefix: Map<string, string | null>,
): { prefix: string; count: number; first: string; last: string }[] {
  const out = new Map<
    string,
    { prefix: string; count: number; first: string; last: string }
  >();
  const next = new Map(lastByPrefix);
  for (const p of missing) {
    const prefix = `R-${tashkentMonthKey(p.createdAt).slice(0, 4)}-`;
    const code = `${prefix}${nextSequence(next.get(prefix) ?? null, prefix)}`;
    next.set(prefix, code);
    const row = out.get(prefix);
    if (row) {
      row.count += 1;
      row.last = code;
    } else {
      out.set(prefix, { prefix, count: 1, first: code, last: code });
    }
  }
  return [...out.values()];
}

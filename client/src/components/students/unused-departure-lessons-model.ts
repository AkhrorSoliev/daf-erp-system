/**
 * Pure math for «Foydalanilmagan darslar qarzini bekor qilish» (spec
 * 2026-10-31): the dialog's live total as the CEO ticks days on and off.
 * The server recomputes and re-caps independently — this is a preview only.
 */
export interface UnusedDay {
  enrollmentId: string;
  date: string;
  amount: number;
}

export interface UnusedSelectionSummary {
  selectedCount: number;
  /** Capped at the debt — what confirming would actually write off. */
  selectedTotal: number;
  /** Uncapped sum of the ticked days' prices. */
  rawTotal: number;
  /** True when `rawTotal` exceeds the debt. */
  capped: boolean;
  afterBalance: number;
}

export const dayKey = (d: Pick<UnusedDay, "enrollmentId" | "date">) =>
  `${d.enrollmentId}:${d.date}`;

export function summarizeUnusedSelection(
  days: readonly UnusedDay[],
  uncheckedKeys: ReadonlySet<string>,
  balance: number,
): UnusedSelectionSummary {
  const selected = days.filter((d) => !uncheckedKeys.has(dayKey(d)));
  const rawTotal = selected.reduce((sum, d) => sum + d.amount, 0);
  const debt = Math.max(0, -balance);
  const selectedTotal = Math.min(rawTotal, debt);
  return {
    selectedCount: selected.length,
    selectedTotal,
    rawTotal,
    capped: rawTotal > debt,
    afterBalance: balance + selectedTotal,
  };
}

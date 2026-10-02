/**
 * Pure planning for `repair-missing-accrual-credits.ts` (ADR-0050).
 *
 * A live accrual must have exactly one live SALARY_ACCRUAL credit on the
 * teacher's ledger. The 26.09.2026 monthly-billing migration reversed each
 * September credit and re-wrote the accrual, but the re-credit was skipped
 * (the lookup matched the reversal row). This plans the missing credits for
 * one teacher: one row per lesson, the balance chained through them in lesson
 * order, so each row's balanceBefore/After reads like any other ledger row.
 */

export interface MissingCredit {
  attendanceId: string;
  amount: number;
  lessonDate: Date;
  /** The GROUP's branch, as `applyAccrualToBalance` stamps it (D3). */
  branchId: number | null;
}

export interface PlannedCredit extends MissingCredit {
  balanceBefore: number;
  balanceAfter: number;
}

export function chainCredits(
  balance: number,
  missing: MissingCredit[],
): { rows: PlannedCredit[]; balanceAfter: number } {
  const ordered = [...missing].sort(
    (a, b) =>
      a.lessonDate.getTime() - b.lessonDate.getTime() ||
      a.attendanceId.localeCompare(b.attendanceId),
  );
  const rows: PlannedCredit[] = [];
  let running = balance;
  for (const m of ordered) {
    rows.push({
      ...m,
      balanceBefore: running,
      balanceAfter: running + m.amount,
    });
    running += m.amount;
  }
  return { rows, balanceAfter: running };
}

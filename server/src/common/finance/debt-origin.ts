import { TransactionType } from '@prisma/client';
import { tashkentMonthKey } from '../../reports/debt-history.util';

/**
 * Where one student's CURRENT debt came from, and how long they have owed it.
 *
 * Both answers come out of the same walk because they are the same walk: a
 * chronological replay of every balance-moving row, settling credits against
 * the oldest uncovered charge first — which is how the billing engine itself
 * settles. Whatever survives to the end IS today's debt, already labelled by
 * the month it arose in.
 *
 * This is the one implementation of that rule. `ReportsDebtHistoryService`
 * needs it for the monthly aging columns and the debtors list needs it for
 * "qachondan beri"; computing it twice would let the debt page disagree with
 * itself about the same student.
 */
export interface DebtOriginRow {
  type: TransactionType;
  amount: number;
  createdAt: Date;
}

export interface DebtOrigin {
  /**
   * Start of the UNBROKEN debt streak that reaches today, or null when the
   * student owes nothing now. It restarts every time the balance climbs back
   * to zero: someone who cleared their debt in June and fell behind again in
   * August has owed since August, not since May.
   */
  since: Date | null;
  /**
   * Origin month ("YYYY-MM") → still-unpaid amount from that month. Disjoint
   * buckets that sum exactly to the live debt, so a column of them foots to
   * the total rather than counting the same student under several months.
   */
  byMonth: Map<string, number>;
  /**
   * Origin month → debt CREATED that month, whether or not it was later paid.
   * Same prepaid rule as `byMonth`: a charge an advance absorbed never became
   * debt, so it is not counted. Kept here rather than recomputed by the caller
   * because it depends on the same walk.
   */
  addedByMonth: Map<string, number>;
}

/**
 * @param rows one student's balance-moving rows, oldest first. Rows with
 *   `amount === 0` (LESSON_CONSUMPTION) must be filtered out by the caller —
 *   they are the one type written without a balance lock.
 */
export function replayDebtOrigin(rows: DebtOriginRow[]): DebtOrigin {
  let balance = 0;
  let debt = 0;
  let since: Date | null = null;

  // FIFO aging queue: every uncovered charge is parked under the month it
  // landed in, and every credit eats the OLDEST fragment first.
  const aging: Array<{ month: string; left: number }> = [];
  const addedByMonth = new Map<string, number>();
  let head = 0;
  let prepaid = 0;

  for (const r of rows) {
    const key = tashkentMonthKey(r.createdAt);
    const before = debt;
    balance += r.amount;
    debt = balance < 0 ? -balance : 0;

    if (r.amount < 0) {
      // A charge: an advance absorbs it first; only the uncovered remainder
      // becomes debt attributable to this month.
      let debit = -r.amount;
      const absorbed = Math.min(prepaid, debit);
      prepaid -= absorbed;
      debit -= absorbed;
      if (debit > 0) {
        aging.push({ month: key, left: debit });
        addedByMonth.set(key, (addedByMonth.get(key) ?? 0) + debit);
      }
    } else {
      let credit = r.amount;
      while (credit > 0 && head < aging.length) {
        const frag = aging[head];
        const take = Math.min(credit, frag.left);
        frag.left -= take;
        credit -= take;
        if (frag.left === 0) head++;
      }
      if (credit > 0) prepaid += credit;
    }

    if (before === 0 && debt > 0) since = r.createdAt;
    else if (debt === 0) since = null;
  }

  const byMonth = new Map<string, number>();
  for (let i = head; i < aging.length; i++) {
    const frag = aging[i];
    if (frag.left > 0) {
      byMonth.set(frag.month, (byMonth.get(frag.month) ?? 0) + frag.left);
    }
  }

  return { since: debt > 0 ? since : null, byMonth, addedByMonth };
}

/** Whole months between two instants, floored at 0. */
export function wholeMonthsBetween(from: Date, to: Date): number {
  const f = new Date(from.getTime() + 5 * 60 * 60 * 1000);
  const t = new Date(to.getTime() + 5 * 60 * 60 * 1000);
  let months =
    (t.getUTCFullYear() - f.getUTCFullYear()) * 12 +
    (t.getUTCMonth() - f.getUTCMonth());
  if (t.getUTCDate() < f.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

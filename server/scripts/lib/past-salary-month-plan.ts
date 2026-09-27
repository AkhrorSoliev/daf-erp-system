/**
 * The CEO's 27.09.2026 rules for recording payroll months that were paid
 * outside the system after the exact cash/card split was forgotten. Pure —
 * `scripts/settle-past-salary-months.ts` feeds it rows and accounts.
 */

export interface PastMonthRow {
  paymentId: string;
  amount: number;
  /** A global FIXED_MONTHLY rate and no Teacher role. */
  staff: boolean;
}

export interface PastMonthBranchAccounts {
  cashAccountId: string;
  bankAccountId: string;
  /** First movement on any of the branch's accounts; null = never opened. */
  journalStart: Date | null;
}

export interface PastMonthPaymentPlan {
  paymentId: string;
  cashSlices?: { cashAccountId: string; amount: number }[];
  predatesCashJournal?: boolean;
}

/** "2026-05" with pay day 10 → "2026-06-10": paid in the month after. */
export function payDayAfter(month: string, payDay: number): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`;
}

/**
 * - paid before the branch's cash journal began → no movement: the money never
 *   passed through a drawer the system knows;
 * - staff → all cash;
 * - teacher → half cash, half card, the odd so'm to cash.
 * Zero-amount parts are dropped, so a zero payout names no account.
 */
export function planPastMonthPayment(
  row: PastMonthRow,
  accounts: PastMonthBranchAccounts,
  paidAt: Date,
): PastMonthPaymentPlan {
  if (!accounts.journalStart || paidAt < accounts.journalStart) {
    return { paymentId: row.paymentId, predatesCashJournal: true };
  }
  if (row.staff) {
    return {
      paymentId: row.paymentId,
      cashSlices:
        row.amount > 0
          ? [{ cashAccountId: accounts.cashAccountId, amount: row.amount }]
          : [],
    };
  }
  const card = Math.floor(row.amount / 2);
  return {
    paymentId: row.paymentId,
    cashSlices: [
      { cashAccountId: accounts.cashAccountId, amount: row.amount - card },
      { cashAccountId: accounts.bankAccountId, amount: card },
    ].filter((s) => s.amount > 0),
  };
}

import { NetProfit } from './reports-excel.helpers';

/**
 * «Oyning o'z foydasi» — did the month's OWN money cover the month's OWN costs?
 *
 * Distinct from `NetProfit.netProfit`, which counts the full value of the
 * lessons held that month no matter when the cash arrived. This figure starts
 * from `getIncomeMonthAttribution().currentMonth` — only the cash that landed
 * in the month AND belongs to that month's lessons — so collecting old debt
 * cannot flatter it.
 *
 * Negative means the month was propped up by other months' money (old-debt
 * recovery or earlier prepayments). Production June 2026 reads −26 750 444
 * against a positive +4 714 564 net profit; that gap is the whole point.
 *
 * The center top-up is NOT subtracted separately — `np.teacherSalary` is
 * already `covered + centerFunded`, so a second subtraction double-counts it.
 */
export function computeOwnMonthProfit(ownMoney: number, np: NetProfit): number {
  return (
    ownMoney -
    np.teacherSalary -
    np.adminSalary -
    np.operatingExpenses -
    np.refunds
  );
}

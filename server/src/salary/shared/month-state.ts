import { SalaryPaymentStatus } from '@prisma/client';

/** The month's payout state for the «Ish haqi» summary pill (spec §4). */
export type MonthStateKind =
  | 'OPEN'
  | 'NOT_CALCULATED'
  | 'CALCULATED'
  | 'APPROVED'
  | 'PARTLY_PAID'
  | 'PAID';

export interface MonthState {
  kind: MonthStateKind;
  paidCount: number;
  payableCount: number;
}

export function monthStateOf(
  isCurrentMonth: boolean,
  statuses: SalaryPaymentStatus[],
): MonthState {
  const payableCount = statuses.length;
  const paidCount = statuses.filter(
    (s) => s === SalaryPaymentStatus.PAID,
  ).length;
  const of = (kind: MonthStateKind): MonthState => ({
    kind,
    paidCount,
    payableCount,
  });
  if (isCurrentMonth) return of('OPEN');
  if (payableCount === 0) return of('NOT_CALCULATED');
  if (paidCount === payableCount) return of('PAID');
  if (paidCount > 0) return of('PARTLY_PAID');
  return of(
    statuses.includes(SalaryPaymentStatus.CALCULATED)
      ? 'CALCULATED'
      : 'APPROVED',
  );
}

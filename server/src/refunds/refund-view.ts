import { tashkentDateStr } from '../common/date/tashkent';

/**
 * A Refund row as the API sends it: `dueDate` is the Tashkent day
 * ('YYYY-MM-DD'), never the stored 00:00-Tashkent instant (19:00 UTC the day
 * before, which a client slicing the ISO string would read a day early).
 */
export function refundView<T extends { dueDate: Date | null }>(
  row: T,
): Omit<T, 'dueDate'> & { dueDate: string | null } {
  return { ...row, dueDate: row.dueDate ? tashkentDateStr(row.dueDate) : null };
}

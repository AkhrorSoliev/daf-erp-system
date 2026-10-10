import { addBankDays, REFUND_TERM_BANK_DAYS } from '../common/date/bank-days';
import { tashkentDateStr } from '../common/date/tashkent';
import {
  termHolidays,
  type HolidayDateSetDb,
} from '../holidays/holiday-date-set';

/**
 * When a refund opened now must be handed over: the 10th bank day after today,
 * with the holidays of the student's branch (ADR-0077). 'YYYY-MM-DD'.
 */
export async function refundDueDate(
  db: HolidayDateSetDb,
  branchId: number | null,
  now: Date = new Date(),
): Promise<string> {
  const today = tashkentDateStr(now);
  return addBankDays(
    today,
    REFUND_TERM_BANK_DAYS,
    await termHolidays(db, today, branchId),
  );
}

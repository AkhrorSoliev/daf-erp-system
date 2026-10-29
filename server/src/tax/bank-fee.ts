import {
  addMonthsToMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

export const BANK_FEE_LABEL = 'Bank xizmati';

/** Bank xarajati oyning oxirgi kuni bilan yoziladi (spec 2026-10-28 §3). */
export function bankFeeDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** `Expense.date` (`@db.Date`) uchun oy chegarasi, yuqorisi `lt`. */
export function bankFeeWindow(month: string): { gte: Date; lt: Date } {
  return {
    gte: utcMidnightFromDateStr(`${month}-01`),
    lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
  };
}

/**
 * «Oyni yopish» (bank xarajati, bankdan to'langan oylikka ijtimoiy soliq)
 * shu oydan boshlanadi: ADR-0130 stavkalari ham 2026-10 dan. May–sentabr
 * eski qoidalar bilan yopilgan va avvalgidek o'qilishi kerak (ADR-0139).
 */
export const MONTH_CLOSE_FIRST_MONTH = '2026-10';

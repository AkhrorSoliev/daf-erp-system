import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query for the "Ustozlar oyligi" monthly report — one row per teacher for a
 * single selected month. `month` is `YYYY-MM` (Tashkent); when omitted the
 * service defaults to the current month, clamped up to the company's start
 * month. No pagination — the report renders every teacher.
 */
export class SalaryMonthlyQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month 'YYYY-MM' bo'lishi kerak",
  })
  month?: string;

  /** Name / #id filter — same shape as the overview search. */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Center top-up drill-down only: `'true'` spans EVERY month the center has
   * fronted instead of the single `month`.
   *
   * The default view of the debt page needs this because a student's debt is
   * one debt, not a stack of monthly ones — and because defaulting to the
   * current month opened the page on an empty August while every July debtor
   * sat behind a picker. The single-month mode stays for the salary card's
   * dialog, which must foot to the figure that was clicked.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  allMonths?: string;
}

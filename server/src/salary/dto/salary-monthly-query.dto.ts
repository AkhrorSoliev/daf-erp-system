import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query for the "Ustozlar oyligi" monthly report — one row per teacher for a
 * single selected month. `month` is `YYYY-MM` (Tashkent); when omitted the
 * service defaults to the current month, clamped up to the company's start
 * month. No pagination — the report renders every teacher.
 */
export class SalaryMonthlyQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month 'YYYY-MM' bo'lishi kerak" })
  month?: string;

  /** Name / #id filter — same shape as the overview search. */
  @IsOptional()
  @IsString()
  search?: string;
}

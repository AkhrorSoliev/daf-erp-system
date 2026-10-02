import { IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A report asked for one month: `?month=YYYY-MM&branchId=` — the daily history
 * of «Oy oxiriga kutilyapti», the six-month trend and the marketing report.
 * `ReportsQueryDto` cannot serve them: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so a `month` it does not declare is rejected with 400
 * — which is exactly how the history endpoint first shipped broken. Adding
 * `month` to the shared DTO would loosen every other report instead.
 */
export class MonthQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  /**
   * `YYYY-MM`. Validated here rather than silently falling back to the current
   * month: a typo should say so, not quietly answer a different question.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month 'YYYY-MM' ko'rinishida bo'lishi kerak",
  })
  month?: string;
}

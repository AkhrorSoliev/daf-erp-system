import { IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * `ReportsQueryDto` cannot serve this endpoint: the global `ValidationPipe`
 * runs with `forbidNonWhitelisted`, so a `month` parameter it does not declare
 * is rejected with 400 — which is exactly how this shipped broken. Adding
 * `month` to the shared DTO would loosen every other report instead, so the
 * endpoint gets its own.
 */
export class ExpectationHistoryQueryDto {
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

import { IsDateString, IsOptional } from 'class-validator';

/**
 * Body for `POST /salary/calculate`.
 *
 * `asOfDate` is optional — when present, the CEO is settling the period that
 * this date falls INSIDE (pick any day in the target month). Omit it to settle
 * the just-completed period, i.e. the cron's default behaviour. The empty-body
 * call (the original "hisoblash" button) stays valid because the field is
 * optional. Format: 'YYYY-MM-DD'.
 */
export class CalculateSalaryDto {
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}

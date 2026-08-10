import { IsIn, IsOptional } from 'class-validator';
import type { DebtStatusFilter } from '../reports-debt-history.service';

/**
 * Its own DTO rather than `ReportsQueryDto`: the global ValidationPipe runs
 * with `forbidNonWhitelisted`, so a `status` the shared DTO does not declare
 * would be rejected with a 400.
 *
 * There is deliberately no date range — the page always walks every month from
 * the company's `systemStartDate` to today, because a debt roll-forward only
 * foots when it starts from a known-zero opening balance.
 */
export class DebtHistoryQueryDto {
  /** Which slice of the student body to count. Defaults to everyone. */
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status?: DebtStatusFilter;
}

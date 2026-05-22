import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DepartedStudentsSummaryQueryDto } from './departed-students-summary-query.dto';

/**
 * Query for the enrollment-level "departed by reason" list — drives the
 * "Ketish sabablari" chart drill-down. Date-ranged, reason-filterable.
 */
export class DepartedStudentsByReasonQueryDto extends DepartedStudentsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  /** Exact departure reason id. Use "null" (literal string) for "no reason". */
  @IsOptional()
  @IsString()
  departureReasonId?: string;
}

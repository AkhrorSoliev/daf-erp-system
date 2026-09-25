import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DepartedStudentsSummaryQueryDto } from './departed-students-summary-query.dto';

/**
 * Query for the transferred-enrollments list. Date-ranged, paginated,
 * transfer-reason-filterable.
 *
 * A class for the same reason as `DepartedStudentsTeacherChangesQueryDto`:
 * an intersection type on `@Query()` skips the ValidationPipe entirely.
 */
export class DepartedStudentsTransferredQueryDto extends DepartedStudentsSummaryQueryDto {
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

  /** Exact transfer reason id. Use "null" (literal string) for "no reason". */
  @IsOptional()
  @IsString()
  transferReasonId?: string;
}

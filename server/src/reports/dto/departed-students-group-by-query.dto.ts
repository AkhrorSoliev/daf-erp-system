import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for the departed-students "group-by" chart. Reads open departure
 * episodes (ADR-0035), not date-ranged — an optional branch filter (read by
 * the BranchScope guard) plus the grouping dimension.
 */
export class DepartedStudentsGroupByQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsIn(['course', 'teacher', 'branch'])
  groupBy: 'course' | 'teacher' | 'branch';
}

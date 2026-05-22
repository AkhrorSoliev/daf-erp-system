import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for the departed-students "group-by" chart. Snapshot-based — only an
 * optional branch filter plus the grouping dimension.
 */
export class DepartedStudentsGroupByQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsIn(['course', 'teacher', 'branch'])
  groupBy: 'course' | 'teacher' | 'branch';
}

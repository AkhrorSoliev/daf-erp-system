import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for the snapshot-based departed-students blocks (dynamics, by-status).
 * Only an optional branch filter — these blocks are a current-state snapshot,
 * not date-ranged.
 */
export class DepartedStudentsBranchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

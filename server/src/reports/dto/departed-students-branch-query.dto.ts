import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for the "by-status" departed-students chart. Reads open departure
 * episodes (ADR-0035): students who stopped and have not come back, pending
 * ones included. Not date-ranged. `branchId` is read by the BranchScope
 * guard.
 */
export class DepartedStudentsBranchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

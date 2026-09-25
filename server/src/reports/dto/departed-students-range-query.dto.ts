import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/** Query for the date-ranged departed-students charts (dynamics). */
export class DepartedStudentsRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}

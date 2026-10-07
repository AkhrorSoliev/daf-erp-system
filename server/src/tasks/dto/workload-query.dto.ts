import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches } from 'class-validator';
export class WorkloadQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}

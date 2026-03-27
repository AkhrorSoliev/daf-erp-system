import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CountByBranchQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  company_id?: number;
}

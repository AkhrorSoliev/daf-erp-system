import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class BranchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_id?: number;
}

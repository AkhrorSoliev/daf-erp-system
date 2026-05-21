import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ConvertLeadDto {
  // Optional branch the new student is assigned to.
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;
}

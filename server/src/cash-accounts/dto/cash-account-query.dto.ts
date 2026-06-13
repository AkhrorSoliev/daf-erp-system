import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CashAccountType } from '@prisma/client';

export class CashAccountQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsEnum(CashAccountType)
  type?: CashAccountType;
}

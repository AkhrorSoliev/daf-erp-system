import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashAccountType } from '@prisma/client';

export class CreateCashAccountDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CashAccountType)
  type: CashAccountType;

  @IsOptional()
  @IsInt()
  branchId?: number;

  // Optional opening balance (so'm). When > 0, an ADJUSTMENT cash movement is
  // written so the ledger reconciles with the denormalized balance from day one.
  @IsOptional()
  @IsInt()
  @Min(0)
  openingBalance?: number;
}

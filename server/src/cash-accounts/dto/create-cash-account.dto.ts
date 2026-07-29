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

  /**
   * Required. There is no company-level cash account: money physically sits in
   * a branch's drawer or bank, and each branch carries its own costs
   * (docs/branch-decisions.md D4).
   */
  @IsInt()
  branchId: number;

  // Optional opening balance (so'm). When > 0, an ADJUSTMENT cash movement is
  // written so the ledger reconciles with the denormalized balance from day one.
  @IsOptional()
  @IsInt()
  @Min(0)
  openingBalance?: number;
}

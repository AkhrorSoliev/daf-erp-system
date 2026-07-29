import {
  IsInt,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsEnum(ExpensePaymentMethod)
  paymentMethod: ExpensePaymentMethod;

  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  date: string;

  /**
   * Required. Each branch's profit is its own income minus its OWN expenses —
   * there is no company-level "shared cost" bucket (docs/branch-decisions.md
   * D4). A cost that genuinely spans branches is entered as two rows, split by
   * the CEO. A branch-less expense would belong to no branch's P&L at all.
   */
  @IsInt()
  branchId: number;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  // Required when category = TEACHER_ADVANCE: the recipient employee's user id.
  @IsOptional()
  @IsInt()
  relatedUserId?: number;
}

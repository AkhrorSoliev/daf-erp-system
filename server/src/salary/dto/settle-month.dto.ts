import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SettleMonthAccountDto {
  @IsInt()
  branchId!: number;

  @IsString()
  cashAccountId!: string;

  /**
   * How much of that branch's payroll left THIS account. A branch may appear
   * more than once: the July payroll was handed over part cash, part card, and
   * the cash journal has to be able to say so.
   */
  @IsInt()
  @Min(1)
  amount!: number;
}

export class SettleMonthDto {
  /** "YYYY-MM". Omitted → the current Tashkent month (same rule as the report). */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy 'YYYY-MM' ko'rinishida bo'lishi kerak",
  })
  month?: string;

  /** "YYYY-MM-DD" — the day the money actually changed hands. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "To'lov sanasi 'YYYY-MM-DD' ko'rinishida bo'lishi kerak",
  })
  paidAt!: string;

  /**
   * Where the money left from, per branch: `{ branchId, cashAccountId, amount }`.
   * Each branch pays its own payroll from its own drawer (D4), and per branch
   * the amounts must add up to exactly that branch's total — a branch may be
   * listed twice when its payroll came part from the kassa and part from the
   * bank.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SettleMonthAccountDto)
  accounts!: SettleMonthAccountDto[];

  /**
   * The operator retypes the exact total. Re-checked server-side, so a list that
   * changed after the dialog opened is refused instead of half-settled.
   */
  @IsInt()
  @Min(1)
  confirmAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

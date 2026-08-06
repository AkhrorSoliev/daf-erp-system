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
   * One kassa account per branch present in the batch. A list, not a single id:
   * each branch pays its own payroll from its own drawer (D4).
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

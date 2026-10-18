import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The CEO's figure for one staff member's pay in one month (ADR-0112). */
export class SetStaffAdjustmentDto {
  @Matches(MONTH, { message: "month 'YYYY-MM' bo'lishi kerak" })
  month: string;

  /** Pay for the month before advances, so'm. */
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  amount: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Sababini yozing' })
  @MaxLength(300)
  reason: string;
}

export class ClearStaffAdjustmentQueryDto {
  @Matches(MONTH, { message: "month 'YYYY-MM' bo'lishi kerak" })
  month: string;
}

import { IsInt, IsOptional, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** `GET /expenses/month-summary` (spec B6 §5.2): the month and the header's branch, nothing else. */
export class ExpenseMonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy YYYY-MM ko'rinishida bo'lishi kerak",
  })
  oy?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;
}

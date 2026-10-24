import {
  IsOptional,
  IsInt,
  IsEnum,
  IsString,
  IsArray,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toNumberArray, toStringArray } from '../../common/dto/to-array';

export class ExpenseQueryDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(ExpenseCategory, { each: true })
  category?: ExpenseCategory[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(ExpensePaymentMethod, { each: true })
  paymentMethod?: ExpensePaymentMethod[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  /** The page's month, `YYYY-MM` (spec B6 §4.1). The old `startDate`/`endDate` stay for the deploy window. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy YYYY-MM ko'rinishida bo'lishi kerak",
  })
  oy?: string;

  /** «Kim kiritgan»: `?createdById=10234,10567` (spec B6 §4.5). */
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  createdById?: number[];

  // Free-text search over the expense description.
  @IsOptional()
  @IsString()
  search?: string;
}

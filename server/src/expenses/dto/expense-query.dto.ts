import { IsOptional, IsInt, IsEnum, IsString, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toStringArray } from '../../common/dto/to-array';

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

  // Free-text search over the expense description.
  @IsOptional()
  @IsString()
  search?: string;
}

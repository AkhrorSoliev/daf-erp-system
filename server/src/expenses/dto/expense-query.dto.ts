import { IsOptional, IsInt, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ExpenseQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsEnum(ExpensePaymentMethod)
  paymentMethod?: ExpensePaymentMethod;

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

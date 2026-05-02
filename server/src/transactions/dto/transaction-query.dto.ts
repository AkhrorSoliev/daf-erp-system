import { IsOptional, IsInt, IsEnum, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

const TRANSACTION_TYPE_REGEX = new RegExp(
  `^(${Object.values(TransactionType).join('|')})(,(${Object.values(
    TransactionType,
  ).join('|')}))*$`,
);

export class TransactionQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  // Comma-separated list of TransactionType values, e.g.
  // "PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE". Validated against the enum
  // so an invalid token is rejected at the boundary.
  @IsOptional()
  @IsString()
  @Matches(TRANSACTION_TYPE_REGEX, {
    message: 'types must be a comma-separated list of TransactionType values',
  })
  types?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

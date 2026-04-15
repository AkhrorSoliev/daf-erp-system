import { IsOptional, IsInt, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

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

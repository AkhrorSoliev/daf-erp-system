import { IsOptional, IsInt, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { SalaryPaymentStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class SalaryPaymentQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsEnum(SalaryPaymentStatus)
  status?: SalaryPaymentStatus;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

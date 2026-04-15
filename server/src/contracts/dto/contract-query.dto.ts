import { IsOptional, IsInt, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ContractStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ContractQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

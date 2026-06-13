import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CashMovementType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class MovementQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CashMovementType)
  type?: CashMovementType;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

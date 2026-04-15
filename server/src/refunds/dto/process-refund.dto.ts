import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { RefundStatus } from '@prisma/client';

export class ProcessRefundDto {
  @IsEnum(RefundStatus)
  @IsNotEmpty()
  status: RefundStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

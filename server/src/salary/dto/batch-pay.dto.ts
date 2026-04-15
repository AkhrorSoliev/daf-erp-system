import { IsArray, IsEnum, IsInt, IsOptional } from 'class-validator';
import { SalaryPaymentStatus } from '@prisma/client';

export class BatchPayDto {
  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  // Defaults to [APPROVED]. Callers who want to pay CALCULATED too must pass
  // it explicitly — forces the operator to acknowledge they are skipping the
  // approval step.
  @IsOptional()
  @IsArray()
  @IsEnum(SalaryPaymentStatus, { each: true })
  statuses?: SalaryPaymentStatus[];
}

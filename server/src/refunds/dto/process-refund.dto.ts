import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod, RefundStatus } from '@prisma/client';

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

  // Channel used to return the money. Required in spirit when status
  // transitions to COMPLETED so the refund is auditable, but left optional
  // on the DTO so approve-only flows don't have to set it.
  @IsOptional()
  @IsEnum(PaymentMethod)
  refundMethod?: PaymentMethod;
}

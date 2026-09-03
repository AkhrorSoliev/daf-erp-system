import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class QuickRefundDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  // Optional: a frozen student has no ACTIVE enrollment, so the refund draws
  // on the free balance alone. Omitted (or null) selects that balance-only
  // path; a student with an ACTIVE enrollment must supply it as before.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  enrollmentId?: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  refundMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  reason?: string;
}

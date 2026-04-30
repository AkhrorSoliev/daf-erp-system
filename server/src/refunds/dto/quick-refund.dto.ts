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

  @IsString()
  @IsNotEmpty()
  enrollmentId: string;

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

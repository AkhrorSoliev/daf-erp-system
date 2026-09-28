import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsInt()
  @Min(1000)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  branchId?: number;

  // ADR-0047: a part payment carries the date the rest will be paid by.
  @IsOptional()
  @IsDateString()
  promiseDate?: string;
}

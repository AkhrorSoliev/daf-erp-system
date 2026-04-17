import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class AttachExternalPaymentDto {
  @IsInt()
  studentId: number;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  externalId: string;

  @IsOptional()
  @IsInt()
  providerFee?: number;

  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

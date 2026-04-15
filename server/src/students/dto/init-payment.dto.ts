import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class InitPaymentDto {
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsEnum(PaymentMethod, {
    message: "method must be one of: PAYME, CLICK, UZUM (CASH/TRANSFER not allowed for student portal)",
  })
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  returnUrl?: string;
}

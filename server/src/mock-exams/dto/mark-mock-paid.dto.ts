import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum MockPaymentMethod {
  CASH = 'CASH',
  PAYME = 'PAYME',
  CLICK = 'CLICK',
}

export class MarkMockPaidDto {
  @IsEnum(MockPaymentMethod)
  method: MockPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

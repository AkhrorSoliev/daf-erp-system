import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContractStatus } from '@prisma/client';

export class ChangeContractStatusDto {
  @IsEnum(ContractStatus)
  @IsNotEmpty()
  status: ContractStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

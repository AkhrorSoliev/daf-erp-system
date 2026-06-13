import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  fromAccountId: string;

  @IsString()
  @IsNotEmpty()
  toAccountId: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

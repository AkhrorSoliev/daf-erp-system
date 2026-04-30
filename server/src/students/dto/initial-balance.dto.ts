import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class InitialBalanceDto {
  // 0 is allowed (no carryover) but never negative — that would imply we
  // owe the student money, which is what refunds are for.
  @IsInt()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

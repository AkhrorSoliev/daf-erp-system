import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class BankFeeItemDto {
  @IsString()
  cashAccountId: string;

  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  amount: number;
}

export class SaveBankFeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BankFeeItemDto)
  items: BankFeeItemDto[];
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class BankFeeItemDto {
  @IsString()
  cashAccountId: string;

  @IsInt()
  @Min(0)
  amount: number;
}

export class SaveBankFeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BankFeeItemDto)
  items: BankFeeItemDto[];
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PayCashSliceDto {
  @IsUUID()
  cashAccountId: string;

  @IsInt()
  @Min(1)
  amount: number;
}

/** «Berildi»: the day the salary was handed over and where the money left (spec §5.2). */
export class PayPaymentDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak",
  })
  paidAt: string;

  /** Empty only when the payment is 0 so'm (advances took the whole salary). */
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PayCashSliceDto)
  cashSlices: PayCashSliceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

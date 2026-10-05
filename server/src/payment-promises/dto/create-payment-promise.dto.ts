import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentPromiseDto {
  @Type(() => Number)
  @IsInt()
  studentId: number;

  // ISO date — the day the student committed to pay by.
  @IsDateString({ strict: true })
  promiseDate: string;

  // Izoh majburiy — har bir to'lov sanasi konteksti bilan yoziladi.
  @IsString()
  @IsNotEmpty({ message: 'Izoh kiritilishi shart' })
  comment: string;

  // ADR-0072: the drawer's «Summa». Optional — the call and payment dialogs send none.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647) // int4
  promisedAmount?: number;
}

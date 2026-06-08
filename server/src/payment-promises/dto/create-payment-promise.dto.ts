import {
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentPromiseDto {
  @Type(() => Number)
  @IsInt()
  studentId: number;

  // ISO date — the day the student committed to pay by.
  @IsDateString()
  promiseDate: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  promisedAmount?: number;

  // Izoh majburiy — har bir va'da konteksti bilan yoziladi.
  @IsString()
  @IsNotEmpty({ message: 'Izoh kiritilishi shart' })
  comment: string;
}

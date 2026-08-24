import { IsInt, IsString, IsNotEmpty, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentPromiseDto {
  @Type(() => Number)
  @IsInt()
  studentId: number;

  // ISO date — the day the student committed to pay by.
  @IsDateString()
  promiseDate: string;

  // Izoh majburiy — har bir to'lov sanasi konteksti bilan yoziladi.
  @IsString()
  @IsNotEmpty({ message: 'Izoh kiritilishi shart' })
  comment: string;
}

import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** «Bekor qilish» from the To'lovlar drawer: the reason is required (spec B4 §5.7). */
export class ReversePaymentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Bekor qilish sababini yozing' })
  @MaxLength(500)
  reason: string;
}

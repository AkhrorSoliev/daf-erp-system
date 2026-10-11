import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateBy } from 'class-validator';

/**
 * Only a string can be too long. `MaxLength` also fails on a missing value,
 * which would show «500 belgidan oshmasin» for an absent reason; here a
 * missing or non-string reason is left to `IsString` alone.
 */
const reasonNotTooLong = (value: unknown) =>
  typeof value !== 'string' || value.length <= 500;

/** «Bekor qilish» from the To'lovlar drawer: the reason is required (spec B4 §5.7). */
export class ReversePaymentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Bekor qilish sababini yozing' })
  @IsNotEmpty({ message: 'Bekor qilish sababini yozing' })
  @ValidateBy({
    name: 'reasonNotTooLong',
    validator: {
      validate: reasonNotTooLong,
      defaultMessage: () => 'Sabab 500 belgidan oshmasin',
    },
  })
  reason: string;
}

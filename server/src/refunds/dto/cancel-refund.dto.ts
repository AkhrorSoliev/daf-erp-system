import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelRefundDto {
  // Trimmed before the checks, so a reason of spaces is refused.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  reason: string;
}

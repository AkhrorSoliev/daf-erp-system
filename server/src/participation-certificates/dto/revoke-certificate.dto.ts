import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /participation-certificates/:id/revoke`: the reason is required. */
export class RevokeCertificateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: "Sabab matn bo'lishi kerak" })
  @MinLength(3, { message: "Sabab kamida 3 belgidan iborat bo'lsin" })
  @MaxLength(500, { message: 'Sabab 500 belgidan oshmasin' })
  reason!: string;
}

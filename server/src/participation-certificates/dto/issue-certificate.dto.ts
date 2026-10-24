import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { GER_LEVELS } from '../participation-rules';

/** `POST /students/:id/participation-certificates`. */
export class IssueCertificateDto {
  @IsIn([...GER_LEVELS], { message: "Daraja noto'g'ri" })
  level!: string;

  /** Only the CEO may use it, and only when the student does not meet the rule. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: "Sabab matn bo'lishi kerak" })
  @MaxLength(500, { message: 'Sabab 500 belgidan oshmasin' })
  exemptReason?: string;
}

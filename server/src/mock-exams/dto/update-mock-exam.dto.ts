import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FormFieldDto } from '../../custom-forms/dto/form-field.dto';
import { CEFR_LEVELS } from '../mock-exam-pricing.util';

export class UpdateMockExamDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  examDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  registrationDeadline?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxScore?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  passingScore?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  /**
   * Discounted mock fee (so'm) for real DaF students. `null` clears the
   * discount (DaF students revert to the full `price`).
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  studentPrice?: number | null;

  /** CEFR levels offered (subset of A1..C2). Empty array = no level step. */
  @IsOptional()
  @IsArray()
  @IsIn(CEFR_LEVELS, { each: true })
  offeredLevels?: string[];

  /** Exam time slots as "HH:mm". Empty array = no time-choice step. */
  @IsOptional()
  @IsArray()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  examTimes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  formFields?: FormFieldDto[];
}

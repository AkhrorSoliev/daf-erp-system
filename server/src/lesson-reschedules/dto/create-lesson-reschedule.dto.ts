import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLessonRescheduleDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  /** YYYY-MM-DD — the original lesson day (must be a normal lesson day). */
  @IsDateString()
  originalDate: string;

  /** YYYY-MM-DD — the new lesson day (any weekday). */
  @IsDateString()
  newDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

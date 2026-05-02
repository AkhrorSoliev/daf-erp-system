import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  /** Optional room override on the new date. NULL → group's default room. */
  @IsOptional()
  @IsString()
  newRoomId?: string;

  /** Optional start time override on the new date — HH:MM (24h). */
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM, { message: 'newLessonStartTime must be HH:MM' })
  newLessonStartTime?: string;

  /** Optional end time override on the new date — HH:MM (24h). */
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM, { message: 'newLessonEndTime must be HH:MM' })
  newLessonEndTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

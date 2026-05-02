import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Edits an existing reschedule. `originalDate` is intentionally NOT
 * editable — it's the audit anchor for the cascade that reversed
 * attendance on create. Use delete + re-create if you need to repoint
 * the audit row.
 *
 * `newRoomId` / time fields use null to clear an override (fall back to
 * the group default), and `undefined` to leave the value untouched.
 */
export class UpdateLessonRescheduleDto {
  @IsOptional()
  @IsDateString()
  newDate?: string;

  @IsOptional()
  @IsString()
  newRoomId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM, { message: 'newLessonStartTime must be HH:MM' })
  newLessonStartTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM, { message: 'newLessonEndTime must be HH:MM' })
  newLessonEndTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

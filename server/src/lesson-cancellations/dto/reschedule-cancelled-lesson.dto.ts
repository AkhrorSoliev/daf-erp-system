import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Body of `POST /lesson-cancellations/:id/reschedule` — the same fields as a
 * plain move, minus `groupId` and `originalDate`: the cancellation names both.
 */
export class RescheduleCancelledLessonDto {
  /** YYYY-MM-DD — the new lesson day (any weekday). */
  @IsDateString()
  newDate: string;

  /** Optional room override on the new date. Empty → the group's room. */
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

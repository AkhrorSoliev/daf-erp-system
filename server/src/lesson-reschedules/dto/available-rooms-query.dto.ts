import { IsDateString, IsNotEmpty, IsString, Matches } from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailableRoomsQueryDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  /** YYYY-MM-DD — the new lesson day to check rooms for. */
  @IsDateString()
  date: string;

  /** HH:MM (24h) — proposed lesson start time. */
  @IsString()
  @Matches(TIME_HHMM, { message: 'startTime must be HH:MM' })
  startTime: string;

  /** HH:MM (24h) — proposed lesson end time (must be > startTime). */
  @IsString()
  @Matches(TIME_HHMM, { message: 'endTime must be HH:MM' })
  endTime: string;
}

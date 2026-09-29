import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «Bo'lmadi» (spec 2026-09-29 §3.5): cancel with a refund, or move. */
export class NotHeldDto {
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  reason: string;

  @IsIn(['CANCEL', 'RESCHEDULE'])
  action: 'CANCEL' | 'RESCHEDULE';

  @ValidateIf((o: NotHeldDto) => o.action === 'RESCHEDULE')
  @IsDateString()
  newDate?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'newLessonStartTime must be HH:MM' })
  newLessonStartTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'newLessonEndTime must be HH:MM' })
  newLessonEndTime?: string;

  @IsOptional()
  @IsString()
  newRoomId?: string;
}

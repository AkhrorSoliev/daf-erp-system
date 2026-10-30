import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

/**
 * `POST /students/:id/barred-lessons/restore` (ADR-0142). `attendedDays` may
 * be empty: «hech biriga kelmagan» is a decision too and is written to the
 * student's history.
 */
export class RestoreBarredLessonsDto {
  @IsUUID()
  enrollmentId: string;

  @IsArray()
  @ArrayMaxSize(62)
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  attendedDays: string[];
}

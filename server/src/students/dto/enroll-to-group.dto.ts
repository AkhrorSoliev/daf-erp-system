import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class EnrollToGroupDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  /**
   * Optional transfer reason ID (from `EnrollmentTransferReason`).
   * Required only when the student is being transferred AND the new group's
   * teacher set differs from the current group's — enforced server-side.
   */
  @IsOptional()
  @IsString()
  transferReasonId?: string;

  /**
   * Date the student starts appearing in this group's attendance and being
   * billed. Frontend's "qaysi darsdan boshlab" dropdown writes this. Format:
   * YYYY-MM-DD (Tashkent calendar). Omitted → service defaults to today.
   *
   * The server only checks the format; a start day that is today with today's
   * lesson already over needs `attendedTodayLesson`.
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Was the student at today's lesson? Needed when it already ended. */
  @IsOptional()
  @IsBoolean()
  attendedTodayLesson?: boolean;
}

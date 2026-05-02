import {
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
   * Server validates: must be a real lesson date for the group's schedule
   * (matches exactDays + within startDate..endDate + not a holiday).
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

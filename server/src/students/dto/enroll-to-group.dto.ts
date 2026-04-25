import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}

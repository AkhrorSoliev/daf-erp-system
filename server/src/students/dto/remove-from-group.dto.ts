import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RemoveFromGroupDto {
  /**
   * ID of a configured DepartureReason. Preferred over free-text `reason`.
   * When provided, the reason's name becomes the stored statusChangeReason.
   */
  @IsOptional()
  @IsUUID()
  departureReasonId?: string;

  /**
   * Free-text fallback when no enumerated reason is selected
   * (e.g. cascade paths or manual API callers).
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RemoveFromGroupDto {
  // ID of a configured StudentExitReason with appliesTo: GROUP_REMOVAL.
  // Service-level validation enforces that one of the two is supplied
  // depending on whether configured reasons exist for the company.
  @IsOptional()
  @IsUUID()
  departureReasonId?: string;

  // Free-text fallback when no configured reasons exist for the company,
  // OR additional comment alongside a selected reasonId.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

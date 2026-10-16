import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class LeadOwnershipSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUntouched?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  firstActionHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  followUpDays?: number;
}

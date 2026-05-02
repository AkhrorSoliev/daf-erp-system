import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateSalaryPeriodSettingDto {
  // 1..28 — capping at 28 avoids the "what about February?" footgun.
  @IsInt()
  @Min(1)
  @Max(28)
  cycleStartDay: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

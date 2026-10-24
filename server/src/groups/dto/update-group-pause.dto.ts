import { IsBoolean, IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Changes the restart day of a group that is already paused (ADR-0119, §1a). */
export class UpdateGroupPauseDto {
  @IsOptional()
  @Matches(DAY, { message: "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak" })
  plannedResumeOn?: string;

  @IsOptional()
  @IsBoolean()
  resumeUnknown?: boolean;
}

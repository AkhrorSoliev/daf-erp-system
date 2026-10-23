import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { GroupStatus } from '@prisma/client';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";

export class ChangeGroupStatusDto {
  @IsEnum(GroupStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(GroupStatus).join(', ')}`,
  })
  status: GroupStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Pausing: the day lessons are planned to restart (ADR-0119, §1a). */
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  plannedResumeOn?: string;

  /** Pausing: the restart day is not known yet; the alternative to the day. */
  @IsOptional()
  @IsBoolean()
  resumeUnknown?: boolean;

  /** Resuming: the day lessons restart, today or later (ADR-0119, §1b). */
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  resumeOn?: string;
}

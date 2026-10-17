import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { CutKey } from '../attendance-stats.types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";

/**
 * `GET /reports/attendance-stats/overview` and `/excel` (spec B7c §6). The
 * client resolves its period buttons to the two days, as 7a does; the range
 * itself (real day, floor 2026-05-01) is checked in `resolvePeriod`.
 */
export class AttendanceStatsQueryDto {
  @Matches(DAY, { message: DAY_MESSAGE })
  startDate: string;

  @Matches(DAY, { message: DAY_MESSAGE })
  endDate: string;

  @IsOptional()
  @IsIn(['group', 'teacher', 'course'])
  cut?: CutKey;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(50)
  pageSize?: number;
}

/** `GET /reports/attendance-stats/missers`: one row of the cut. `key` = group id, teacher id or `none`, course id. */
export class AttendanceMissersQueryDto extends AttendanceStatsQueryDto {
  @IsString()
  @MaxLength(64)
  key: string;
}

import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AttendanceDatesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  month?: number;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Type(() => Number)
  year?: number;
}

export class AttendanceStatsQueryDto {
  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;
}

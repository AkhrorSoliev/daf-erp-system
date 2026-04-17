import { IsInt, IsOptional, Matches, Min } from 'class-validator';
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
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "startDate YYYY-MM-DD formatda bo'lishi kerak",
  })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "endDate YYYY-MM-DD formatda bo'lishi kerak",
  })
  endDate?: string;
}

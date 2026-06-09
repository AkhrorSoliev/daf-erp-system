import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

export class ListCallLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  // Scope to a single student (student profile "Qo'ng'iroq tarixi" tab).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;

  // Optional YYYY-MM-DD calendar day (Tashkent) — filters the history tab.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date YYYY-MM-DD formatida bo'lishi kerak",
  })
  date?: string;
}

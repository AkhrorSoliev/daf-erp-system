import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DepartedStudentsSummaryQueryDto } from './departed-students-summary-query.dto';

export class DepartedStudentsListQueryDto extends DepartedStudentsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  /** When set, filter to enrollments that departed with this reason. Use "null" (literal string) for "Sababi ko'rsatilmagan". */
  @IsOptional()
  @IsString()
  departureReasonId?: string;
}

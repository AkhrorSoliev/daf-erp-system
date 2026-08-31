import { IsArray, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toNumberArray, toStringArray } from '../../common/dto/to-array';

export class DepartedStudentsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  // Nomi ataylab birlikda — qarang: student-payments-report-query.dto.ts.
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsUUID(undefined, { each: true })
  courseId?: string[];

  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  teacherIds?: number[];

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}

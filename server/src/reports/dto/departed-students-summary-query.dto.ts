import { IsArray, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toNumberArray } from '../../common/dto/to-array';

export class DepartedStudentsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsUUID()
  courseId?: string;

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

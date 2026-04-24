import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

function toArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as string[];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export class DepartedStudentsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @Transform(({ value }) => toArray(value)?.map((v) => Number(v)))
  @IsArray()
  @IsInt({ each: true })
  teacherIds?: number[];

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}

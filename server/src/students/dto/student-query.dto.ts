import { IsOptional, IsInt, IsString, IsArray, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toNumberArray, toStringArray } from '../../common/dto/to-array';

/** Holat filtri variantlari — har biri alohida `where` bo'lagiga aylanadi. */
export const STUDENT_STATUS_FILTERS = [
  'active',
  'frozen',
  'ungrouped',
  'graduated',
  'expelled',
] as const;
export type StudentStatusFilter = (typeof STUDENT_STATUS_FILTERS)[number];

/**
 * Ko'p tanlovli filtrlar vergul bilan keladi (`?level=A1,A2`). Bitta qiymat
 * eski havolalardagidek ishlaydi — u bir elementli ro'yxatga aylanadi.
 */
export class StudentQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(STUDENT_STATUS_FILTERS, { each: true })
  status?: StudentStatusFilter[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branch_id?: number;

  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  teacher_id?: number[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  group_id?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  level?: string[];
}

import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toNumberArray, toStringArray } from '../../../common/dto/to-array';
import type { ListState } from '../departed.types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";

/** The page's picked days and the course/teacher filter (spec B7a §4). */
export class DepartedFilterDto {
  @Matches(DAY, { message: DAY_MESSAGE })
  startDate: string;

  @Matches(DAY, { message: DAY_MESSAGE })
  endDate: string;

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
}

/** The list adds a search, a reason, a state, a debt switch and the page. */
export class DepartedListQueryDto extends DepartedFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonId?: string;

  @IsOptional()
  @IsIn(['ketgan', 'kutilmoqda', 'qaytgan'])
  state?: ListState;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  debtorsOnly?: boolean;

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

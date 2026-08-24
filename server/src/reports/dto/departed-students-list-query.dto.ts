import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { StudentStatus } from '@prisma/client';

/**
 * Query for the "Ketgan o'quvchilar" list. The list is a student-level
 * snapshot — a student is "departed" when they have no group they currently
 * study in (zero ACTIVE enrollments). It is not date-ranged.
 */
export class DepartedStudentsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  /**
   * Optional StudentStatus filter (Faol-guruhsiz / Muzlatilgan /
   * Chetlashtirilgan ...). When omitted, every departed student is returned.
   * GRADUATED is rejected — graduated students are never "departed".
   */
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  /** "Faqat qarzdorlar" — when true, only students with a negative balance. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  debtorsOnly?: boolean;

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
}

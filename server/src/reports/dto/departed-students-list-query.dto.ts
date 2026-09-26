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
 * Query for the "Ketgan o'quvchilar" list. Reads open departure episodes
 * (ADR-0035): students who stopped and have not come back, pending ones
 * included. Not date-ranged. `branchId` is read by the BranchScope guard.
 */
export class DepartedStudentsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  /**
   * Optional StudentStatus filter (Faol-guruhsiz / Muzlatilgan /
   * Chetlashtirilgan ...). When omitted, every open episode is returned.
   * GRADUATED is not honoured as a filter value — the service treats it the
   * same as "no filter", since a graduated student's episode is never shown
   * as a departure in the first place.
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

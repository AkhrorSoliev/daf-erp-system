import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type AttendanceBucket = 'week' | 'month';
export type AttendanceSortOrder = 'asc' | 'desc';

export class AttendanceAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['week', 'month'])
  bucket?: AttendanceBucket;
}

export class AttendanceTeacherPerfQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['rate', 'groupsCount'])
  sortBy?: 'rate' | 'groupsCount';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: AttendanceSortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class AttendanceByGroupQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsIn(['rate', 'studentCount', 'lessonCount'])
  sortBy?: 'rate' | 'studentCount' | 'lessonCount';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: AttendanceSortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class AttendanceByCourseQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

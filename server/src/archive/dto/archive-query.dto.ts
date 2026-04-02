import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ArchiveEntityType {
  USERS = 'users',
  BRANCHES = 'branches',
  ROOMS = 'rooms',
  COURSES = 'courses',
  STUDENTS = 'students',
  LEADS = 'leads',
  GROUPS = 'groups',
  ENROLLMENTS = 'enrollments',
  HOLIDAYS = 'holidays',
}

export class ArchiveQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  per_page?: number = 10;

  @IsOptional()
  search?: string;
}
